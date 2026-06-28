import { Networks, Keypair } from '@stellar/stellar-sdk';
import {
    IncrementalMerkleTree, buildInsertInput, ShieldedPoolClient, fieldToBytes32,
} from '@shieldpass/sdk';
import { prisma } from '../db';

const CONTRACT_ID = process.env.STELLAR_CONTRACT_ID || '';
const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

const DEPTH = 20;

// Pending leaves expire after 2 minutes — if the browser closed mid-proof.
const PENDING_TTL_MS = 2 * 60 * 1000;

/**
 * Server-side mirror of the on-chain commitment tree. Serves two roles:
 *  1. Source of truth for membership paths (to build spend proofs in the browser).
 *  2. Coordinates the merkle_insert flow: backend assigns an index + circuit
 *     input, browser proves, browser returns the proof, backend submits on-chain.
 *     This keeps the expensive snarkjs prove() off the server.
 *
 * The faucet seedNote path is the ONLY place prove() still runs server-side
 * (no browser is involved at signup time and it is a very infrequent operation).
 */
class TreeService {
    private tree = new IncrementalMerkleTree(DEPTH);
    private loaded = false;
    // Serializes all tree-advancing ops so concurrent requests can't race the
    // shared tree / leaf index (critical on a single Render instance).
    private chain: Promise<unknown> = Promise.resolve();

    private serialize<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.chain.then(() => fn());
        this.chain = run.then(() => undefined, () => undefined);
        return run;
    }

    /** Rebuild the in-memory tree from persisted leaves (idempotent). */
    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        const leaves = await prisma.treeLeaf.findMany({ orderBy: { index: 'asc' } });
        for (const l of leaves) this.tree.setLeaf(l.index, BigInt(l.commitment));
        (this.tree as unknown as { count: number }).count = leaves.length;
        this.loaded = true;
    }

    async state(): Promise<{ root: string; nextIndex: number }> {
        await this.ensureLoaded();
        return { root: this.tree.root().toString(), nextIndex: this.tree.nextIndex };
    }

    /** Sibling path + index bits for the leaf at `index` (for membership proofs). */
    async pathFor(index: number): Promise<{ siblings: string[]; indices: string[]; root: string }> {
        await this.ensureLoaded();
        const siblings = this.tree.path(index).map(String);
        const indices: string[] = [];
        let idx = index;
        for (let i = 0; i < DEPTH; i++) { indices.push(String(idx & 1)); idx = Math.floor(idx / 2); }
        return { siblings, indices, root: this.tree.root().toString() };
    }

    /** Look up the index of a known commitment (so the client can fetch its path). */
    async indexOf(commitment: string): Promise<number | null> {
        const row = await prisma.treeLeaf.findFirst({ where: { commitment }, select: { index: true } });
        return row ? row.index : null;
    }

    // ── Chain sync guard ─────────────────────────────────────────────────────

    /**
     * Verify the in-memory tree's nextIndex matches the on-chain contract.
     * If they diverge (e.g. DB was cleared without redeploying the contract),
     * throw immediately so the caller gets a clear error instead of submitting
     * a proof built against the wrong old_root.
     */
    private async assertSyncedWithChain(): Promise<void> {
        if (!CONTRACT_ID || !RELAYER_SECRET) return;
        try {
            const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
            const chainIndex = await pool.nextIndex();
            const dbIndex = this.tree.nextIndex;
            if (chainIndex !== dbIndex) {
                throw new Error(
                    `[tree] DIVERGED: DB has ${dbIndex} leaves, chain has ${chainIndex}. ` +
                    `Redeploy the contract to reset on-chain state, then clear the DB.`
                );
            }
        } catch (e: any) {
            if (e.message?.includes('DIVERGED')) throw e;
            console.warn('[tree] chain sync check skipped (RPC unreachable?):', e.message);
        }
    }

    // ── Client-side proving flow ──────────────────────────────────────────────

    /**
     * Step 1 of client-side insert: atomically advance the in-memory tree, persist
     * the leaf as "pending", and return the circuit input the browser needs to prove.
     *
     * The leaf is marked pending so we know the browser hasn't submitted its proof
     * yet. A background cleanup job flags leaves stuck in pending > 2 min.
     */
    async assignInsert(commitment: bigint): Promise<{
        index: number;
        circuitInput: Record<string, unknown>;
    }> {
        return this.serialize(async () => {
            await this.ensureLoaded();
            await this.assertSyncedWithChain();
            const index = this.tree.nextIndex;
            const circuitInput = buildInsertInput(this.tree, commitment); // mutates tree
            await prisma.treeLeaf.create({
                data: { index, commitment: commitment.toString(), status: 'pending', assignedAt: new Date(), circuitInput: circuitInput as any },
            });
            console.log(`[tree/assign] index=${index} commitment=${commitment}`);
            return { index, circuitInput };
        });
    }

    /**
     * Step 2 of client-side insert: receive the browser-generated proof, submit it
     * on-chain via the relayer keypair (cheap — no RAM spike), mark leaf confirmed.
     * Returns the on-chain tx hash.
     */
    async confirmInsert(
        index: number,
        proof: { a: Uint8Array; b: Uint8Array; c: Uint8Array },
        publicSignals: Uint8Array[],
    ): Promise<{ txHash?: string }> {
        // Validate the leaf exists and is pending
        const leaf = await prisma.treeLeaf.findUnique({ where: { index } });
        if (!leaf) throw new Error(`No leaf at index ${index}`);
        if (leaf.status === 'confirmed') {
            console.warn(`[tree/confirm] index=${index} already confirmed — skipping`);
            return { txHash: undefined };
        }

        let txHash: string | undefined;
        if (CONTRACT_ID && RELAYER_SECRET) {
            const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
            txHash = await pool.insert(proof, publicSignals, Keypair.fromSecret(RELAYER_SECRET));
            console.log(`[tree/confirm] index=${index} tx=${txHash}`);
        }

        await prisma.treeLeaf.update({ where: { index }, data: { status: 'confirmed' } });
        return { txHash };
    }

    // ── Faucet assign (client-side proving) ──────────────────────────────────

    /**
     * Authorize a faucet note on-chain (relayer-signed faucet_seed call), then
     * reserve a tree index and return the circuit input the browser needs to prove.
     * prove() never runs server-side — the browser does it via the normal confirm flow.
     */
    async faucetAssign(commitment: bigint): Promise<{ index: number; circuitInput: Record<string, unknown> }> {
        if (CONTRACT_ID && RELAYER_SECRET) {
            const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
            await pool.faucetSeed(fieldToBytes32(commitment), Keypair.fromSecret(RELAYER_SECRET));
        }
        return this.assignInsert(commitment);
    }

    // ── Background cleanup ────────────────────────────────────────────────────

    /**
     * Roll back any pending leaves that have been stuck past PENDING_TTL_MS.
     *
     * When a browser closes mid-proof the DB has a pending leaf but the chain does
     * not. That means DB.nextIndex > chain.nextIndex, which blocks ALL subsequent
     * inserts (assertSyncedWithChain throws). Without a rollback the tree is frozen
     * until the original browser comes back and retries.
     *
     * Fix: delete the expired pending rows from the DB and force a tree rebuild.
     * After the rebuild nextIndex matches the chain again and new inserts work.
     * The original user will get a 404 on /tree/retry and their note is quietly
     * re-issued on their next onboarding/login attempt.
     */
    async cleanupExpiredPending(): Promise<void> {
        const cutoff = new Date(Date.now() - PENDING_TTL_MS);
        const stale = await prisma.treeLeaf.findMany({
            where: { status: 'pending', assignedAt: { lt: cutoff } },
        });
        if (stale.length === 0) return;

        const indices = stale.map((l) => l.index);
        console.warn(`[tree/cleanup] rolling back ${stale.length} expired pending leaf(ves):`,
            indices.map((i) => `index=${i}`).join(', '));

        await prisma.treeLeaf.deleteMany({ where: { index: { in: indices } } });

        // Force a full rebuild on the next operation so the in-memory tree drops
        // these leaves and nextIndex falls back in line with the chain.
        this.loaded = false;
        console.log('[tree/cleanup] in-memory tree invalidated — will rebuild on next request');
    }
}

export const treeService = new TreeService();

// Run the cleanup check every 60 seconds.
setInterval(() => treeService.cleanupExpiredPending().catch(() => {}), 60_000);
