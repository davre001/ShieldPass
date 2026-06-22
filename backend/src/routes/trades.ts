import { Router } from 'express';
import { isValidStellarAddress } from '@shieldpass/sdk';
import { prisma } from '../db';
import { checkProof, burnNullifier } from '../services/compliance';
import { createVirtualAccount } from '../services/paystack';
import { emitTradeUpdate, onTradeUpdate } from '../services/tradeEvents';

const router = Router();
const VALID_ASSETS = ['USDC', 'XLM', 'NGNC'];
const PAYMENT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes to pay

// List OPEN trades (the marketplace).
router.get('/trades', async (_req, res) => {
  const trades = await prisma.trade.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  res.json(trades);
});

// Seller creates a trade. Crypto must already be locked on-chain (escrowOfferId) by the seller's wallet.
router.post('/trades', async (req, res) => {
  const { sellerWallet, assetType, cryptoAmount, nairaRate, sellerBankAccount, escrowOfferId, proof, publicInputs, nullifier } = req.body;

  if (!sellerWallet || !assetType || !cryptoAmount || !nairaRate || !sellerBankAccount || !escrowOfferId) {
    return res.status(400).json({ error: 'sellerWallet, assetType, cryptoAmount, nairaRate, sellerBankAccount, escrowOfferId required.' });
  }
  if (!isValidStellarAddress(sellerWallet)) return res.status(400).json({ error: 'Invalid Stellar wallet address.' });
  if (!VALID_ASSETS.includes(String(assetType).toUpperCase())) return res.status(400).json({ error: `assetType must be one of: ${VALID_ASSETS.join(', ')}` });
  if (!(Number(cryptoAmount) > 0) || !(Number(nairaRate) > 0)) return res.status(400).json({ error: 'cryptoAmount and nairaRate must be positive numbers.' });
  if (!proof || !nullifier || !Array.isArray(publicInputs)) return res.status(400).json({ error: 'proof, publicInputs[], nullifier required (seller KYC).' });

  const check = await checkProof({ proof, publicInputs, nullifier });
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  const expectedAmount = String(Number(cryptoAmount) * Number(nairaRate));
  const trade = await prisma.trade.create({
    data: {
      status: 'OPEN', assetType: String(assetType).toUpperCase(), cryptoAmount: String(cryptoAmount),
      nairaRate: String(nairaRate), expectedAmount, sellerWallet, sellerBankAccount, escrowOfferId: String(escrowOfferId),
    },
  });
  await burnNullifier(String(nullifier), sellerWallet, 'create_offer');
  emitTradeUpdate(trade);
  res.json({ success: true, trade });
});

// Buyer accepts a trade: verify buyer KYC, lock the offer, issue a virtual account to pay into.
router.post('/trades/:id/accept', async (req, res) => {
  const { id } = req.params;
  const { buyerWallet, buyerEmail, proof, publicInputs, nullifier } = req.body;

  if (!buyerWallet || !buyerEmail) return res.status(400).json({ error: 'buyerWallet and buyerEmail are required.' });
  if (!isValidStellarAddress(buyerWallet)) return res.status(400).json({ error: 'Invalid Stellar buyer wallet address.' });
  if (!proof || !nullifier || !Array.isArray(publicInputs)) return res.status(400).json({ error: 'proof, publicInputs[], nullifier required (buyer KYC).' });

  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  if (trade.status !== 'OPEN') return res.status(400).json({ error: `Trade is not available. Status: ${trade.status}` });
  if (trade.sellerWallet === buyerWallet) return res.status(400).json({ error: 'You cannot accept your own offer.' });

  const check = await checkProof({ proof, publicInputs, nullifier });
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  const va = await createVirtualAccount({ email: buyerEmail, tradeId: trade.id });
  const updated = await prisma.trade.update({
    where: { id },
    data: {
      status: 'AWAITING_PAYMENT', buyerWallet, virtualAccountRef: va.reference,
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
    },
  });
  await burnNullifier(String(nullifier), buyerWallet, 'accept');
  emitTradeUpdate(updated);

  res.json({
    success: true,
    trade: updated,
    payTo: { accountNumber: va.accountNumber, bankName: va.bankName, amount: trade.expectedAmount },
    message: `Send ₦${trade.expectedAmount} to ${va.bankName} ${va.accountNumber}. Crypto releases automatically once received.`,
  });
});

// Active (non-terminal) trades for a wallet. MUST be declared before '/trades/:id' (which would
// otherwise match '/trades/active' with id='active').
router.get('/trades/active', async (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!wallet) return res.status(400).json({ error: 'wallet is required.' });
  const trades = await prisma.trade.findMany({
    where: { OR: [{ sellerWallet: wallet }, { buyerWallet: wallet }], status: { notIn: ['SETTLED', 'CANCELLED', 'DISPUTED'] } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(trades.map((t) => ({ ...t, role: t.sellerWallet === wallet ? 'seller' : 'buyer' })));
});

// Real-time per-wallet trade updates (Server-Sent Events). Also before '/trades/:id'.
router.get('/trades/live', (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!wallet) return res.status(400).json({ error: 'wallet is required.' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const hb = setInterval(() => res.write(': hb\n\n'), 25000);
  const off = onTradeUpdate((t) => {
    if (t.sellerWallet === wallet || t.buyerWallet === wallet) res.write(`data: ${JSON.stringify(t)}\n\n`);
  });
  req.on('close', () => { clearInterval(hb); off(); res.end(); });
});

// Fetch a single trade by id (used by the tester to poll status through its lifecycle).
router.get('/trades/:id', async (req, res) => {
  const trade = await prisma.trade.findUnique({ where: { id: req.params.id } });
  if (!trade) return res.status(404).json({ error: 'Trade not found.' });
  res.json(trade);
});

// Per-wallet trade history (buyer OR seller). Role is derived server-side; never trust the client.
router.get('/history', async (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!wallet) return res.status(400).json({ error: 'wallet is required.' });
  const status = req.query.status ? String(req.query.status) : undefined;

  const where: { OR: object[]; status?: string } = {
    OR: [{ sellerWallet: wallet }, { buyerWallet: wallet }],
  };
  if (status) where.status = status;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const trades = await prisma.trade.findMany({
    where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
  });
  res.json(trades.map((t) => ({ ...t, role: t.sellerWallet === wallet ? 'seller' : 'buyer' })));
});

/**
 * Cancels AWAITING_PAYMENT trades whose payment window has elapsed.
 * NOTE: the on-chain escrow refund (cancel_offer) is seller-authorized and is handled
 * separately; this only advances the off-chain trade state. Returns the count cancelled.
 */
export async function expireStaleTrades(): Promise<number> {
  const stale = await prisma.trade.findMany({
    where: { status: 'AWAITING_PAYMENT', expiresAt: { lt: new Date() } },
  });
  for (const t of stale) {
    const cancelled = await prisma.trade.update({ where: { id: t.id }, data: { status: 'CANCELLED' } });
    emitTradeUpdate(cancelled);
  }
  return stale.length;
}

export default router;
