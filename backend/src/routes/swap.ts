import { Router } from 'express';
import { Networks, Keypair } from '@stellar/stellar-sdk';
import { ShieldedPoolClient } from '@shieldpass/sdk';
import { prisma } from '../db';
import { burnNullifier } from '../services/compliance';
import { treeService } from '../services/tree';
import { notify } from './notifications';
import { getQuote, TIER2_THRESHOLD_NAIRA } from '../services/quote';
import { initiateTransfer as initiateLencoTransfer, type LencoTransferResult } from '../services/lenco';
import { initiatePaystackTransfer } from '../services/paystack';

const router = Router();

const CONTRACT_ID = process.env.STELLAR_CONTRACT_ID || '';
const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" }, { code: "050", name: "Ecobank" },
  { code: "011", name: "First Bank" }, { code: "058", name: "GTBank" },
  { code: "50211", name: "Kuda" }, { code: "50515", name: "Moniepoint" },
  { code: "999992", name: "OPay" }, { code: "033", name: "UBA" },
  { code: "057", name: "Zenith Bank" },
];

// POST /swap/quote — Naira payout for any Stellar asset + whether it needs Tier 2 (BVN).
router.post('/quote', (req, res) => {
  const { tokenAddress, cryptoAmount, assetCode } = req.body;
  if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress is required.' });
  if (!(Number(cryptoAmount) > 0)) return res.status(400).json({ error: 'cryptoAmount must be a positive number.' });

  const quote = getQuote(String(tokenAddress), Number(cryptoAmount), assetCode);
  const requireBvn = quote.nairaAmount > TIER2_THRESHOLD_NAIRA;
  res.json({ ...quote, requireBvn, tier2ThresholdNaira: TIER2_THRESHOLD_NAIRA });
});

// POST /execute — the core off-ramp orchestration (trustless shielded-pool flow).
// The ZK proof was already verified ON-CHAIN by the client's `confidential_swap`
// call (which burned the note's nullifier, enforced the tier, and recorded a
// pending payout under `onChainSwapId`). The backend therefore only:
//   1) pays the Naira via Paystack/Lenco  2) calls `claim_swap(onChainSwapId)`
// to sweep the swapped crypto to the treasury. No off-chain verification, no
// fabricated settlement proof.
router.post('/execute', async (req, res) => {
  const { email, ephemeralBankDetails, tokenAddress, cryptoAmount, assetCode, onChainSwapId, nullifier, changeCommitment } = req.body;

  if (!email || !ephemeralBankDetails || !tokenAddress || onChainSwapId === undefined || onChainSwapId === null) {
    return res.status(400).json({ error: 'email, ephemeralBankDetails, tokenAddress and onChainSwapId are required.' });
  }
  if (!(Number(cryptoAmount) > 0)) return res.status(400).json({ error: 'cryptoAmount must be a positive number.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'No account for that email.' });

  // ZERO-STORAGE ARCHITECTURE:
  // We do not save or look up the bank account in the DB.
  // We use the ephemeral details passed directly from the client's local storage.
  const { accountNumber, bankName, accountName } = ephemeralBankDetails;

  // 1. Price the swap (the contract already enforced the tier gate on-chain).
  const quote = getQuote(String(tokenAddress), Number(cryptoAmount), assetCode);

  // Record the swap as fiat-processing before moving fiat.
  // Note: bankAccountId is nullified in DB structure per Zero-Storage architecture.
  const swap = await prisma.swap.create({
    data: {
      userId: user.id, tokenAddress: String(tokenAddress),
      cryptoAmount: Number(cryptoAmount), nairaAmount: quote.nairaAmount,
      status: 'FIAT_PROCESSING', swapId: String(onChainSwapId),
    },
  });

  // 3. Pay the Naira out to the user's bank account ephemerally.
  let transfer: LencoTransferResult = await initiatePaystackTransfer({
    amountNaira: quote.nairaAmount,
    accountNumber: accountNumber,
    bankCode: NIGERIAN_BANKS.find(b => b.name === bankName)?.code, 
    bankName: bankName,
    accountName: accountName,
    reference: `ps_${swap.id}`, 
  });

  let processorUsed = 'Paystack';

  if (!transfer.ok || transfer.status === 'failed') {
    console.warn(`[swap/execute] Paystack failed: ${transfer.error}. Falling back to Lenco...`);
    transfer = await initiateLencoTransfer({
      amountNaira: quote.nairaAmount,
      accountNumber: accountNumber,
      bankCode: NIGERIAN_BANKS.find(b => b.name === bankName)?.code,
      bankName: bankName,
      accountName: accountName,
      reference: `lc_${swap.id}`, 
    });
    processorUsed = 'Lenco';
  }

  if (!transfer.ok || transfer.status === 'failed') {
    // Both fiat providers failed — leave the crypto locked. The user can refund after the on-chain time-lock.
    await prisma.swap.update({ where: { id: swap.id }, data: { status: 'REFUNDED' } });
    return res.status(502).json({ error: `Fiat payout failed on all providers: ${transfer.error || 'unknown error'}. Your crypto stays locked and is refundable after the time-lock.` });
  }
  await prisma.swap.update({ where: { id: swap.id }, data: { lencoTransferId: transfer.transferId } });

  // 4. Fiat settled — record the spent nullifier (the contract is the authority;
  // this is a convenience index) and claim the swapped crypto into the treasury.
  if (nullifier) await burnNullifier(String(nullifier), user.smartWalletAddress || email, 'swap');

  let txHash: string | null = null;
  if (CONTRACT_ID && RELAYER_SECRET) {
    try {
      // admin (relayer) sweeps the pending payout to the treasury. If this never
      // runs, the user reclaims their value trustlessly via refund_swap() after
      // the on-chain time-lock.
      const pool = new ShieldedPoolClient(RPC_URL, NETWORK, CONTRACT_ID);
      txHash = await pool.claimSwap(BigInt(onChainSwapId), Keypair.fromSecret(RELAYER_SECRET));
    } catch (err) {
      console.error('[swap/execute] claim_swap failed (fiat already paid):', err);
    }
  }

  const completed = await prisma.swap.update({
    where: { id: swap.id }, data: { status: 'COMPLETED', txHash: txHash ?? undefined },
  });
  await notify(email, 'WITHDRAW_FIAT', `₦${quote.nairaAmount.toLocaleString()} sent to ${bankName}`, { amount: String(quote.nairaAmount), asset: 'NGN' });

  // 5. Insert the change note (already queued on-chain by confidential_swap) into the
  // tree so the user can spend it later. Returns the new leaf index for the client.
  let changeLeafIndex: number | null = null;
  if (changeCommitment) {
    try {
      const { index } = await treeService.appendAndInsert(BigInt(changeCommitment));
      changeLeafIndex = index;
    } catch (e) {
      console.error('[swap/execute] change-note insert failed:', e);
    }
  }

  res.json({
    success: true,
    swap: completed,
    changeLeafIndex,
    payout: { amountNaira: quote.nairaAmount, bank: `${bankName} ${accountNumber}`, transferId: transfer.transferId, processor: processorUsed },
    message: `₦${quote.nairaAmount.toLocaleString()} sent to ${bankName} ${accountNumber}. (Bank Details deleted from memory)`,
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
