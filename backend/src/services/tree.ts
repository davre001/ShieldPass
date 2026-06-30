import { Networks, Keypair } from '@stellar/stellar-sdk';
import {
    IncrementalMerkleTree, buildInsertInput, ShieldedPoolClient, fieldToBytes32,
} from '@shieldpass/sdk';
import { StellarContractClient } from '@shieldpass/sdk/dist/stellar';
import { prisma } from '../db';
import { type PoolConfig, getPoolConfig, defaultPoolId, allPoolIds } from './pools';

const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

const DEPTH = 20;

// Pending leaves expire after 2 minutes — if the browser closed mid-proof.
const PENDING_TTL_MS = 2 * 60 * 1000;

/**
 * Server-side mirror of ONE on-chain commitment tree (one shielded_pool instance).
 * Each asset has its own pool/tree, so there is one TreeService per pool — see the
 * `treeServiceFor` registry below. Responsibilities:
 *  1. Source of truth for membership paths (to build spend proofs in the browser).
 *  2. Coordinates the merkle_insert flow: backend assigns an index + circuit input,
 *     browser proves, browser returns the proof, backend submits on-chain.
 *
 * The faucet seedNote path is the ONLY place prove() still runs server-side, and only
 * for the faucet pool (XLM) at signup.
 */
class TreeService {
    private tree = new IncrementalMerkleTree(DEPTH);
    private loaded = false;
    // Serializes all tree-advancing ops so concurrent requests can't race the
    // shared tree / leaf index (critical on a single Render instance).
    private chain: Promise<unknown> = Promise.resolve();

    constructor(private readonly pool: PoolConfig) {}

    private get poolId(): string { return this.pool.poolId; }

    private serialize<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.chain.then(() => fn());
        this.chain = run.then(() => undefined, () => undefined);
        return run;
    }

    /** Rebuild the in-memory tree from this pool's persisted leaves (idempotent). */
    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        const leaves = await prisma.treeLeaf.findMany({
            where: { poolId: this.poolId },
            orderBy: { index: 'asc' },
        });
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

    /** Look up the index of a known commitment in this pool (so the client can fetch its path). */
    async indexOf(commitment: string): Promise<number | null> {
        const row = await prisma.treeLeaf.findFirst({
            where: { poolId: this.poolId, commitment },
            select: { index: true },
        });
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
        if (!this.poolId || !RELAYER_SECRET) return;
        try {
            const pool = new ShieldedPoolClient(RPC_URL, NETWORK, this.poolId);
            const chainIndex = await pool.nextIndex();
            // Compare CONFIRMED DB leaves only — pending leaves are legitimately
            // ahead of the chain (they are in-flight proofs, not committed yet).
            const confirmedCount = await prisma.treeLeaf.count({
                where: { poolId: this.poolId, status: 'confirmed' },
            });
            if (chainIndex !== confirmedCount) {
                throw new Error(
                    `[tree] DIVERGED (pool ${this.poolId}): DB has ${confirmedCount} confirmed leaves, chain has ${chainIndex}. ` +
                    `A previous insert tx likely failed after the DB was marked confirmed. ` +
                    `To recover without redeploying, run in Neon: ` +
                    `UPDATE "TreeLeaf" SET status='pending' WHERE "poolId"='${this.poolId}' AND status='confirmed' AND index >= ${chainIndex};`
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
                data: { poolId: this.poolId, index, commitment: commitment.toString(), status: 'pending', assignedAt: new Date(), circuitInput: circuitInput as any },
            });
            console.log(`[tree/assign] pool=${this.poolId} index=${index} commitment=${commitment}`);
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
        const leaf = await prisma.treeLeaf.findUnique({ where: { poolId_index: { poolId: this.poolId, index } } });
        if (!leaf) throw new Error(`No leaf at index ${index} in pool ${this.poolId}`);
        if (leaf.status === 'confirmed') {
            console.warn(`[tree/confirm] pool=${this.poolId} index=${index} already confirmed — skipping`);
            return { txHash: undefined };
        }

        // NEVER mark a leaf confirmed without actually landing the insert on-chain.
        if (!this.poolId || !RELAYER_SECRET) {
            throw new Error('[tree/confirm] pool contract id / RELAYER_SECRET not configured — refusing to mark leaf confirmed (would diverge the tree).');
        }
        const pool = new ShieldedPoolClient(RPC_URL, NETWORK, this.poolId);
        const txHash = await pool.insert(proof, publicSignals, Keypair.fromSecret(RELAYER_SECRET));
        await pool.waitForLanding(txHash);
        console.log(`[tree/confirm] pool=${this.poolId} index=${index} tx=${txHash}`);

        await prisma.treeLeaf.update({ where: { poolId_index: { poolId: this.poolId, index } }, data: { status: 'confirmed' } });
        return { txHash };
    }

    /** Fetch a stored pending leaf (for the browser's /tree/retry recovery). */
    async getLeaf(index: number) {
        return prisma.treeLeaf.findUnique({ where: { poolId_index: { poolId: this.poolId, index } } });
    }

    // ── Faucet assign (client-side proving) ──────────────────────────────────

    /**
     * Reserve a tree index for a faucet note and return the circuit input the browser
     * needs to prove. DB/tree only — NO on-chain I/O, so it never blocks sign-in.
     */
    async faucetAssign(commitment: bigint): Promise<{ index: number; circuitInput: Record<string, unknown> }> {
        return this.assignInsert(commitment);
    }

    /**
     * Background, off the HTTP critical path: settle a faucet note on-chain (faucet pool only).
     *  1. faucet_seed(commitment) — registers the note commitment as Pending (gas only).
     *  2. fundWallet(pool, faucetAmount) — backs the note with real crypto so it can be unshielded.
     */
    async settleFaucetOnChain(commitment: bigint): Promise<void> {
        if (!this.poolId || !RELAYER_SECRET) return;
        if (!this.pool.faucet) {
            console.warn(`[tree/faucet] pool ${this.poolId} is not a faucet pool — skipping settle`);
            return;
        }
        const pool = new ShieldedPoolClient(RPC_URL, NETWORK, this.poolId);
        const relayer = Keypair.fromSecret(RELAYER_SECRET);

        await pool.faucetSeed(fieldToBytes32(commitment), relayer);
        console.log(`[tree/faucet] faucet_seed landed for commitment=${commitment}`);

        if (this.pool.sacAddress) {
            const stellar = new StellarContractClient(RPC_URL, NETWORK, this.pool.sacAddress);
            const fundHash = await stellar.fundWallet(this.pool.sacAddress, this.poolId, this.pool.faucetAmount, relayer);
            await pool.waitForLanding(fundHash);
            console.log(`[tree/faucet] funded pool ${this.pool.faucetAmount} stroops tx=${fundHash}`);
        } else {
            console.warn('[tree/faucet] pool SAC not set — pool not funded, unshield will fail');
        }
    }

    // ── Background cleanup ────────────────────────────────────────────────────

    /** Roll back this pool's pending leaves stuck past PENDING_TTL_MS. */
    async cleanupExpiredPending(): Promise<void> {
        const cutoff = new Date(Date.now() - PENDING_TTL_MS);
        const stale = await prisma.treeLeaf.findMany({
            where: { poolId: this.poolId, status: 'pending', assignedAt: { lt: cutoff } },
        });
        if (stale.length === 0) return;

        const indices = stale.map((l) => l.index);
        console.warn(`[tree/cleanup] pool=${this.poolId} rolling back ${stale.length} expired pending leaf(ves):`,
            indices.map((i) => `index=${i}`).join(', '));

        await prisma.treeLeaf.deleteMany({ where: { poolId: this.poolId, index: { in: indices } } });

        // Force a full rebuild on the next operation so the in-memory tree drops these.
        this.loaded = false;
        console.log('[tree/cleanup] in-memory tree invalidated — will rebuild on next request');
    }
}

// ── Per-pool registry ─────────────────────────────────────────────────────────

const registry = new Map<string, TreeService>();

/**
 * Get the TreeService for a pool. `poolId` is the on-chain shielded_pool contract id
 * the frontend used for its deposit/unshield/swap invoke; omit it to use the default
 * (XLM) pool. Throws on an unknown, non-empty pool id so a bad request can't write into
 * the wrong tree.
 */
export function treeServiceFor(poolId?: string): TreeService {
    const cfg = getPoolConfig(poolId);
    if (!cfg) throw new Error(`unknown shielded pool: ${poolId}`);
    let svc = registry.get(cfg.poolId);
    if (!svc) { svc = new TreeService(cfg); registry.set(cfg.poolId, svc); }
    return svc;
}

/** The default-pool (XLM) service. Kept for the faucet path and back-compat callers. */
export const treeService = treeServiceFor(defaultPoolId());

// Run the cleanup check every 60 seconds across ALL configured pools.
setInterval(() => {
    for (const id of allPoolIds()) treeServiceFor(id).cleanupExpiredPending().catch(() => {});
}, 60_000);
