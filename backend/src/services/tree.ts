import path from 'path';
import { Networks, Keypair } from '@stellar/stellar-sdk';
import {
    IncrementalMerkleTree, buildInsertInput, prove, ShieldedPoolClient, fieldToBytes32,
} from '@shieldpass/sdk';
import { prisma } from '../db';

const CONTRACT_ID = process.env.STELLAR_CONTRACT_ID || '';
const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

const INSERT_WASM = path.join(__dirname, '../../circuits/merkle_insert.wasm');
const INSERT_ZKEY = path.join(__dirname, '../../circuits/merkle_insert_final.zkey');
const DEPTH = 20;

/**
 * Server-side mirror of the on-chain commitment tree. It is the source of truth
 * for membership paths the browser needs (to build confidential_swap proofs) and
 * it advances the on-chain root by generating merkle_insert proofs — which the
 * contract verifies, so the backend cannot forge the tree.
 */
class TreeService {
    private tree = new IncrementalMerkleTree(DEPTH);
    private loaded = false;
    // Serializes all tree-advancing ops so concurrent requests can't race the
    // shared tree / leaf index (critical on a single Render instance).
    private chain: Promise<unknown> = Promise.resolve();

    private serialize<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.chain.then(() => fn());
        this.chain = run.then(() => undefined, () => undefined); // keep the chain alive on error
        return run;
    }

    /** Rebuild the in-memory tree from persisted leaves (idempotent). */
    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        const leaves = await prisma.treeLeaf.findMany({ orderBy: { index: 'asc' } });
        for (const l of leaves) this.tree.setLeaf(l.index, BigInt(l.commitment));
        // restore the append cursor
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

    /**
     * Append a commitment that has ALREADY been queued on-chain (deposit/faucet_seed/
     * confidential_swap change note). Generates a merkle_insert proof and submits
     * insert() so the on-chain root advances trustlessly. Returns the new leaf index.
     */
    async appendAndInsert(commitment: bigint): Promise<{ index: number; root: string; txHash?: string }> {
        return this.serialize(() => this._append(commitment));
    }

    /** Unserialized append+insert. ALWAYS call via serialize(). */
    private async _append(commitment: bigint): Promise<{ index: number; root: string; txHash?: string }> {
        await this.ensureLoaded();
        const index = this.tree.nextIndex;
        const input = buildInsertInput(this.tree, commitment); // mutates tree (appends)
        const root = this.tree.root().toString();

        await prisma.treeLeaf.create({ data: { index, commitment: commitment.toString() } });

        let txHash: string | undefined;
        if (CONTRACT_ID && RELAYER_SECRET) {
            const { proof, publicSignals } = await prove(input, INSERT_WASM, INSERT_ZKEY);
            const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
            txHash = await pool.insert(proof, publicSignals, Keypair.fromSecret(RELAYER_SECRET));
        }
        return { index, root, txHash };
    }

    /**
     * Seed a faucet note: queue the commitment on-chain (faucet_seed, admin) and then
     * advance the tree (insert) — atomically, so the on-chain queue and tree stay in step.
     * Returns the leaf index the client uses to fetch its path.
     */
    async seedNote(commitment: bigint): Promise<{ index: number; root: string }> {
        return this.serialize(async () => {
            await this.ensureLoaded();
            if (CONTRACT_ID && RELAYER_SECRET) {
                const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
                await pool.faucetSeed(fieldToBytes32(commitment), Keypair.fromSecret(RELAYER_SECRET));
            }
            const { index, root } = await this._append(commitment);
            return { index, root };
        });
    }
}

export const treeService = new TreeService();
