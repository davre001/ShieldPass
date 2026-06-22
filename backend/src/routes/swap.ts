import { Router } from 'express';
import { Networks, Keypair } from '@stellar/stellar-sdk';
import { StellarContractClient } from '@shieldpass/sdk';
import { prisma } from '../db';
import { checkProof, burnNullifier } from '../services/compliance';
import { getQuote, TIER2_THRESHOLD_NAIRA } from '../services/quote';
import { initiateTransfer } from '../services/lenco';

const router = Router();

const CONTRACT_ID = process.env.STELLAR_CONTRACT_ID || '';
const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

// Normalize a circuit field value ('1', '0x..01', 1) to a 0/1 string.
function fieldToBit(v: unknown): string {
  try { return BigInt(String(v)) === 1n ? '1' : '0'; } catch { return '0'; }
}

// POST /swap/quote — Naira payout for any Stellar asset + whether it needs Tier 2 (BVN).
router.post('/quote', (req, res) => {
  const { tokenAddress, cryptoAmount, assetCode } = req.body;
  if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress is required.' });
  if (!(Number(cryptoAmount) > 0)) return res.status(400).json({ error: 'cryptoAmount must be a positive number.' });

  const quote = getQuote(String(tokenAddress), Number(cryptoAmount), assetCode);
  const requireBvn = quote.nairaAmount > TIER2_THRESHOLD_NAIRA;
  res.json({ ...quote, requireBvn, tier2ThresholdNaira: TIER2_THRESHOLD_NAIRA });
});

// POST /swap/execute — the core off-ramp orchestration.
// 1) verify the (progressive) ZK proof  2) pay Naira via Lenco  3) claim the locked crypto on-chain.
router.post('/execute', async (req, res) => {
  const { email, bankAccountId, tokenAddress, cryptoAmount, assetCode, onChainSwapId, proof, publicInputs, nullifier } = req.body;

  if (!email || !bankAccountId || !tokenAddress || !onChainSwapId) {
    return res.status(400).json({ error: 'email, bankAccountId, tokenAddress and onChainSwapId are required.' });
  }
  if (!(Number(cryptoAmount) > 0)) return res.status(400).json({ error: 'cryptoAmount must be a positive number.' });
  if (!proof || !nullifier || !Array.isArray(publicInputs)) {
    return res.status(400).json({ error: 'proof, publicInputs[] and nullifier are required (KYC).' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'No account for that email.' });
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!bank || bank.userId !== user.id) return res.status(404).json({ error: 'Bank account not found for this user.' });

  // 1. Price the swap and decide the required tier.
  const quote = getQuote(String(tokenAddress), Number(cryptoAmount), assetCode);
  const requireBvn = quote.nairaAmount > TIER2_THRESHOLD_NAIRA ? '1' : '0';

  // The proof's public require_bvn (last public input) must match what this swap demands — a user
  // cannot off-ramp a high-value amount with a Tier 1 (require_bvn = 0) proof.
  const provenRequireBvn = fieldToBit(publicInputs[publicInputs.length - 1]);
  if (provenRequireBvn !== requireBvn) {
    return res.status(400).json({
      error: requireBvn === '1'
        ? 'This amount requires identity verification (BVN). Upgrade to Tier 2 and retry.'
        : 'Proof tier does not match the swap amount.',
    });
  }

  // 2. Verify the ZK proof (replay-checked, cryptographically verified).
  const check = await checkProof({ proof, publicInputs, nullifier });
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  // Record the swap as locked-on-chain / fiat-processing before moving fiat.
  const swap = await prisma.swap.create({
    data: {
      userId: user.id, bankAccountId: bank.id, tokenAddress: String(tokenAddress),
      cryptoAmount: Number(cryptoAmount), nairaAmount: quote.nairaAmount,
      status: 'FIAT_PROCESSING', swapId: String(onChainSwapId),
    },
  });

  // 3. Pay the Naira out to the user's bank account via Lenco.
  const transfer = await initiateTransfer({
    amountNaira: quote.nairaAmount,
    accountNumber: bank.accountNumber,
    bankName: bank.bankName,
    accountName: bank.accountName,
    reference: swap.id,
  });
  if (!transfer.ok || transfer.status === 'failed') {
    // Fiat failed — leave the crypto locked. The user can refund after the on-chain time-lock.
    await prisma.swap.update({ where: { id: swap.id }, data: { status: 'REFUNDED' } });
    return res.status(502).json({ error: `Fiat payout failed: ${transfer.error || 'unknown error'}. Your crypto stays locked and is refundable after the time-lock.` });
  }
  await prisma.swap.update({ where: { id: swap.id }, data: { lencoTransferId: transfer.transferId } });

  // 4. Fiat settled — burn the nullifier and claim the locked crypto into the treasury.
  await burnNullifier(String(nullifier), user.smartWalletAddress || email, 'swap');

  let txHash: string | null = null;
  if (CONTRACT_ID && RELAYER_SECRET) {
    try {
      const stellar = new StellarContractClient(RPC_URL, NETWORK, CONTRACT_ID);
      txHash = await stellar.claimSwap(BigInt(onChainSwapId), Keypair.fromSecret(RELAYER_SECRET));
    } catch (err) {
      console.error('[swap/execute] claim_swap failed (fiat already paid):', err);
      // Fiat paid but on-chain claim failed — keep COMPLETED for the fiat side; ops can re-claim.
    }
  }

  const completed = await prisma.swap.update({
    where: { id: swap.id }, data: { status: 'COMPLETED', txHash: txHash ?? undefined },
  });

  res.json({
    success: true,
    swap: completed,
    payout: { amountNaira: quote.nairaAmount, bank: `${bank.bankName} ${bank.accountNumber}`, transferId: transfer.transferId },
    message: `₦${quote.nairaAmount.toLocaleString()} sent to ${bank.bankName} ${bank.accountNumber}.`,
  });
});

// GET /swap/history?email= — a user's swap history.
router.get('/history', async (req, res) => {
  const email = String(req.query.email || '');
  if (!email) return res.status(400).json({ error: 'email query param is required.' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'No account for that email.' });
  const swaps = await prisma.swap.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  res.json(swaps);
});

export default router;
