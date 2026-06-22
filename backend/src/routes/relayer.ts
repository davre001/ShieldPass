import { Router } from 'express';
import { Networks, Keypair } from '@stellar/stellar-sdk';
import { StellarContractClient } from '@shieldpass/sdk';
import { checkProof, burnNullifier } from '../services/compliance';
import { prisma } from '../db';

const router = Router();

// Load environment variables
const CONTRACT_ID = process.env.STELLAR_CONTRACT_ID || '';
const RELAYER_SECRET = process.env.STELLAR_RELAYER_SECRET || '';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

// 1. Relayer Endpoint: verify a ZK compliance proof, burn its nullifier, optionally broadcast on-chain.
router.post('/submit-proof', async (req, res) => {
  const { walletAddress, proof, publicInputs, nullifier, action, tokenAddress, amount } = req.body;

  if (!walletAddress || !proof || !action) {
    return res.status(400).json({ error: 'walletAddress, proof, and action are required.' });
  }
  if (!nullifier) {
    return res.status(400).json({ error: 'nullifier is required (single-use replay protection).' });
  }
  if (!Array.isArray(publicInputs)) {
    return res.status(400).json({ error: 'publicInputs must be an array of field strings.' });
  }

  const check = await checkProof({ proof, publicInputs, nullifier });
  if (!check.ok) return res.status(check.status).json({ error: check.error });
  console.log(`[Relayer] ZK Proof Verified for ${walletAddress}.`);

  // Step 3: Optionally broadcast on-chain. We only do this when we have everything needed to
  // build a CORRECT typed contract call via the SDK — never a malformed argless call.
  let txHash: string;
  let status: string;
  const canBroadcast = CONTRACT_ID && RELAYER_SECRET && action === 'create_offer' && tokenAddress && amount;
  try {
    if (canBroadcast) {
      const stellar = new StellarContractClient(RPC_URL, Networks.TESTNET, CONTRACT_ID);
      const created = await stellar.createOffer(
        { sellerWallet: walletAddress, tokenAddress, amount: BigInt(amount), nullifier: String(nullifier) },
        { kind: 'keypair', keypair: Keypair.fromSecret(RELAYER_SECRET) },
      );
      txHash = created.hash;
      status = 'pending';
      console.log(`[Relayer] create_offer submitted on-chain: ${txHash}`);
    } else {
      // Proof is valid and the nullifier is burned, but we lack the typed args (or creds) to
      // broadcast. The seller's wallet completes the on-chain step via the SDK directly.
      txHash = `verified_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      status = 'verified';
    }
  } catch (err) {
    console.error('[Relayer] On-chain submission failed:', err);
    return res.status(502).json({ error: 'Proof verified, but the on-chain transaction failed.' });
  }

  // Step 4: Burn the nullifier (can never be replayed) and record the transaction.
  try {
    const transaction = await prisma.relayerTransaction.create({
      data: { walletAddress, action, txHash, status },
    });
    await burnNullifier(String(nullifier), walletAddress, action);
    return res.json({
      success: true,
      message: status === 'pending'
        ? 'Proof verified and transaction submitted to Stellar.'
        : 'Proof verified and nullifier burned (no on-chain broadcast — supply tokenAddress + amount to go live).',
      transaction,
    });
  } catch (err) {
    console.error('[Relayer] DB write failed:', err);
    return res.status(500).json({ error: 'Internal Server Error.' });
  }
});

export default router;
