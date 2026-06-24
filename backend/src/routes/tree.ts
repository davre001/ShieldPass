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

// POST /tree/insert — advance the tree for a commitment the user just queued on-chain
// (via deposit()). Generates a merkle_insert proof + submits insert(); returns the leaf index.
// Safe: the contract rejects a leaf that isn't genuinely pending, so this can't forge notes.
router.post('/insert', async (req, res) => {
    const { commitment } = req.body || {};
    if (!commitment || !/^\d+$/.test(String(commitment))) {
        return res.status(400).json({ error: 'commitment (decimal field element) is required' });
    }
    try {
        const { index, root } = await treeService.appendAndInsert(BigInt(commitment));
        res.json({ index, root });
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'insert failed' });
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

export default router;
