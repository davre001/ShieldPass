import { Router } from 'express';
import { treeService } from '../services/tree';

const router = Router();

// GET /tree/state — current root + next free index.
router.get('/state', async (_req, res) => {
    try {
        res.json(await treeService.state());
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'tree state failed' });
    }
});

// GET /tree/path/:index — sibling path + index bits for a leaf (membership proof input).
router.get('/path/:index', async (req, res) => {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'invalid index' });
    try {
        res.json(await treeService.pathFor(index));
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'tree path failed' });
    }
});

// ── Client-side proving: two-step insert ──────────────────────────────────────

/**
 * POST /tree/assign
 * Step 1: register a commitment and return the circuit input the browser needs to
 * generate the merkle_insert proof. The leaf is written as "pending" immediately
 * so the index is reserved, even though the proof hasn't been submitted yet.
 *
 * Body: { commitment: string }   (decimal field element)
 * Returns: { index: number, circuitInput: { old_root, new_root, leaf, index, siblings } }
 */
router.post('/assign', async (req, res) => {
    const { commitment } = req.body || {};
    if (!commitment || !/^\d+$/.test(String(commitment))) {
        return res.status(400).json({ error: 'commitment (decimal field element) is required' });
    }
    try {
        const result = await treeService.assignInsert(BigInt(commitment));
        res.json(result);
    } catch (e: any) {
        console.error('[tree/assign] FAILED commitment=%s error=%s', commitment, e?.message);
        res.status(500).json({ error: e?.message || 'assign failed' });
    }
});

/**
 * POST /tree/confirm
 * Step 2: receive the browser-generated proof and submit it on-chain. Marks the
 * leaf as "confirmed" once the transaction is accepted.
 *
 * Body: {
 *   index: number,
 *   proof_a: number[],   (Uint8Array serialised as a plain number array by JSON)
 *   proof_b: number[],
 *   proof_c: number[],
 *   public_signals: number[][]
 * }
 * Returns: { txHash?: string }
 */
router.post('/confirm', async (req, res) => {
    const { index, proof_a, proof_b, proof_c, public_signals } = req.body || {};
    if (typeof index !== 'number' || !proof_a || !proof_b || !proof_c || !public_signals) {
        return res.status(400).json({ error: 'index, proof_a, proof_b, proof_c and public_signals are required' });
    }
    try {
        const proof = {
            a: Uint8Array.from(proof_a),
            b: Uint8Array.from(proof_b),
            c: Uint8Array.from(proof_c),
        };
        const signals: Uint8Array[] = (public_signals as number[][]).map((s) => Uint8Array.from(s));
        const result = await treeService.confirmInsert(index, proof, signals);
        res.json(result);
    } catch (e: any) {
        console.error('[tree/confirm] FAILED index=%s error=%s', index, e?.message);
        res.status(500).json({ error: e?.message || 'confirm failed' });
    }
});

// GET /tree/index/:commitment — resolve a commitment to its leaf index.
router.get('/index/:commitment', async (req, res) => {
    try {
        const index = await treeService.indexOf(String(req.params.commitment));
        if (index === null) return res.status(404).json({ error: 'commitment not in tree' });
        res.json({ index });
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'tree index lookup failed' });
    }
});

/**
 * GET /tree/retry/:index
 * Lets the browser recover a stuck pending proof without re-calling /tree/assign.
 * Returns the stored circuitInput if the leaf is still pending.
 * Returns { status: 'confirmed' } if it already landed on-chain.
 * Returns 404 if the index was rolled back by the cleanup job (treat as "re-issue needed").
 */
router.get('/retry/:index', async (req, res) => {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'invalid index' });
    try {
        const { prisma } = await import('../db');
        const leaf = await prisma.treeLeaf.findUnique({ where: { index } });
        if (!leaf) return res.status(404).json({ error: 'leaf not found (may have been rolled back)' });
        if (leaf.status === 'confirmed') return res.json({ status: 'confirmed' });
        if (!leaf.circuitInput) return res.status(409).json({ error: 'no circuitInput stored for this leaf' });
        res.json({ index, status: 'pending', circuitInput: leaf.circuitInput });
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'retry lookup failed' });
    }
});

// GET /tree/pending-count — monitoring: how many leaves are currently awaiting proof submission.
router.get('/pending-count', async (_req, res) => {
    try {
        const { prisma } = await import('../db');
        const count = await prisma.treeLeaf.count({ where: { status: 'pending' } });
        res.json({ count });
    } catch (e: any) {
        res.status(500).json({ error: e?.message });
    }
});

export default router;
