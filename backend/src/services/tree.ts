import { Networks, Keypair } from '@stellar/stellar-sdk';
import {
    IncrementalMerkleTree, buildInsertInput, ShieldedPoolClient, fieldToBytes32,
} from '@shieldpass/sdk';
import { StellarContractClient } from '@shieldpass/sdk/dist/stellar';
import { prisma } from '../db';

const CONTRACT_ID = process.env.STELLAR_CONTRACT_ID || '';
const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
// XLM SAC address — needed to fund the pool contract when issuing faucet notes.
const XLM_SAC_ADDRESS = process.env.XLM_SAC_ADDRESS || '';
const FAUCET_NOTE_AMOUNT = BigInt(process.env.FAUCET_NOTE_AMOUNT || '5000000000'); // 500 XLM default

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
            // Compare CONFIRMED DB leaves only — pending leaves are legitimately
            // ahead of the chain (they are in-flight proofs, not committed yet).
            const confirmedCount = await prisma.treeLeaf.count({ where: { status: 'confirmed' } });
            if (chainIndex !== confirmedCount) {
                throw new Error(
                    `[tree] DIVERGED: DB has ${confirmedCount} confirmed leaves, chain has ${chainIndex}. ` +
                    `A previous insert tx likely failed after the DB was marked confirmed. ` +
                    `To recover without redeploying, run in Neon: ` +
                    `UPDATE "TreeLeaf" SET status='pending' WHERE status='confirmed' AND index >= ${chainIndex};`
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
            // Wait for the tx to be committed before marking the leaf confirmed.
            // If the tx fails on-chain the leaf stays pending and the retry mechanism
            // can re-submit a fresh proof without DB/chain divergence.
            await pool.waitForLanding(txHash);
            console.log(`[tree/confirm] index=${index} tx=${txHash}`);
        }

        await prisma.treeLeaf.update({ where: { index }, data: { status: 'confirmed' } });
        return { txHash };
    }

    // ── Faucet assign (client-side proving) ──────────────────────────────────

    /**
     * Reserve a tree index for a faucet note and return the circuit input the browser
     * needs to prove. DB/tree only — NO on-chain I/O, so it never blocks sign-in.
     * prove() never runs server-side — the browser does it via the normal confirm flow.
     *
     * The matching on-chain work (faucet_seed + pool funding) is settled separately by
     * settleFaucetOnChain(), which the caller fires in the background after responding.
     */
    async faucetAssign(commitment: bigint): Promise<{ index: number; circuitInput: Record<string, unknown> }> {
        // Reserve the tree index + build the browser's circuit input FIRST (DB/tree
        // only, no on-chain I/O) so sign-in returns in ~1-2s. The relayer's on-chain
        // work (faucet_seed + pool funding) runs in the background while the browser
        // generates its merkle_insert proof (~5-15s) — that proving window masks the
        // testnet landing latency, so the browser's /tree/confirm insert sees the
        // commitment already Pending by the time it submits.
        return this.assignInsert(commitment);
    }

    /**
     * Background, off the HTTP critical path: settle a faucet note on-chain. The two
     * relayer transactions are serialized via waitForLanding because they share one
     * account sequence number — submitting both at once would collide (txBAD_SEQ).
     *
     *  1. faucet_seed(commitment) — registers the note commitment as Pending. This is
     *     CHEAP: it only spends gas (a few stroops in fees), NOT the faucet amount. As
     *     long as the relayer can pay fees, it lands. The browser's insert depends on
     *     this, so it runs first.
     *  2. fundWallet(pool, FAUCET_NOTE_AMOUNT) — backs the note with real XLM so it can
     *     be unshielded (cashed out) later. This is only needed at cash-out time; it
     *     never blocks the note's creation or private transfer. If the relayer is short
     *     on XLM, the note still exists and is transferable — only unshield waits.
     *
     * Failure handling: if faucet_seed never lands, the browser's insert simulation
     * fails, the pending leaf is rolled back by cleanupExpiredPending after 2 min (the
     * tree stays consistent), and the user simply gets no note — they can re-link/login
     * to retry. If it lands late, the browser's retryPendingProofs re-submits on reload.
     */
    async settleFaucetOnChain(commitment: bigint): Promise<void> {
        if (!CONTRACT_ID || !RELAYER_SECRET) return;
        const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
        const relayer = Keypair.fromSecret(RELAYER_SECRET);

        // 1. Register the commitment (gas only). faucetSeed waits for landing so the
        //    pool-funding tx below gets a fresh sequence number off the same account.
        await pool.faucetSeed(fieldToBytes32(commitment), relayer);
        console.log(`[tree/faucet] faucet_seed landed for commitment=${commitment}`);

        // 2. Back the note in the pool (only matters at unshield/cash-out time).
        if (XLM_SAC_ADDRESS) {
            const stellar = new StellarContractClient(RPC_URL, NETWORK, XLM_SAC_ADDRESS);
            const fundHash = await stellar.fundWallet(XLM_SAC_ADDRESS, CONTRACT_ID, FAUCET_NOTE_AMOUNT, relayer);
            await pool.waitForLanding(fundHash);
            console.log(`[tree/faucet] funded pool ${FAUCET_NOTE_AMOUNT} stroops tx=${fundHash}`);
        } else {
            console.warn('[tree/faucet] XLM_SAC_ADDRESS not set — pool not funded, unshield will fail');
        }
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
