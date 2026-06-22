import { Router } from 'express';
import { TrustedIssuer, isValidSorobanAddress } from '@shieldpass/sdk';
import { prisma } from '../db';
import { verifyBvn } from '../services/bvn';
import { hashPin, verifyPin } from '../services/pin';
import { seedWalletFromEnv, type SeedResult } from '../services/seed';

const router = Router();
const issuer = new TrustedIssuer();

// 1. BVN-first onboarding — keyed by email. Name comes from the BVN lookup (not user input).
router.post('/submit-bvn', async (req, res) => {
  const { email, phone, bvn, pin } = req.body;

  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email is required.' });
  if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
    return res.status(400).json({ error: 'A valid 11-digit numeric BVN is required.' });
  }
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'A 4-6 digit PIN is required.' });
  }

  try {
    const check = await verifyBvn(bvn);
    if (!check.ok) return res.status(400).json({ error: 'BVN verification failed.' });

    const pinHash = hashPin(pin);
    // Upsert the user by email. The legal name comes from the BVN lookup.
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: check.returnedName, phone: phone ?? undefined, pinHash },
      create: { email, name: check.returnedName, phone: phone ?? null, pinHash },
    });

    const isHuman = true, bvnVerified = true, goodStanding = true;
    const secretSalt = issuer.generateSecretSalt();
    const leafCommitment = issuer.generateLeaf(BigInt(secretSalt), isHuman, bvnVerified, goodStanding);
    const { merkle_root } = issuer.generateMerkleProof(leafCommitment);
    const leafIndex = 0;

    await prisma.complianceAttestation.upsert({
      where: { userId: user.id },
      update: { leafCommitment, merkleRoot: merkle_root, leafIndex },
      create: { userId: user.id, leafCommitment, merkleRoot: merkle_root, leafIndex, isHuman, bvnVerified, goodStanding },
    });

    return res.json({
      success: true,
      message: 'BVN Verified. Keep this secret salt safe for ZK Proofs.',
      returnedName: check.returnedName,
      secretSalt,
      leafCommitment,
      merkleRoot: merkle_root,
      leafIndex,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 1b. Verify a returning user's PIN (second factor for passkey reconnect).
router.post('/verify-pin', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'email and pin are required.' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'No user for that email.' });
  return res.json({ ok: !!user.pinHash && verifyPin(String(pin), user.pinHash) });
});

// 1c. Re-issue a fresh compliance secret salt for a returning user (login on a new device).
// The salt is client-only and never stored, so it can't be recovered — we mint a new one.
// NOTE: this produces a NEW merkleRoot, which invalidates the previous on-chain commitment.
// Fine on testnet; on mainnet this needs a migration story (or WebAuthn PRF for a stable salt).
router.post('/reissue-salt', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'email and pin are required.' });
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { attestation: true } });
    if (!user) return res.status(404).json({ error: 'No user for that email.' });
    if (!user.pinHash || !verifyPin(String(pin), user.pinHash)) return res.status(401).json({ error: 'Incorrect PIN.' });
    if (!user.attestation) return res.status(409).json({ error: 'Complete BVN onboarding before logging in.' });

    const isHuman = true, bvnVerified = true, goodStanding = true;
    const secretSalt = issuer.generateSecretSalt();
    const leafCommitment = issuer.generateLeaf(BigInt(secretSalt), isHuman, bvnVerified, goodStanding);
    const { merkle_root } = issuer.generateMerkleProof(leafCommitment);

    await prisma.complianceAttestation.update({
      where: { userId: user.id },
      data: { leafCommitment, merkleRoot: merkle_root, leafIndex: 0 },
    });
    return res.json({ success: true, secretSalt, merkleRoot: merkle_root, leafIndex: 0 });
  } catch (err) {
    console.error('[kyc/reissue-salt]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 1d. Look up the account linked to a smart wallet — used by login on a new device, after the
// passkey identifies the wallet, to recover the user's email so the session can be restored.
router.get('/account', async (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!wallet) return res.status(400).json({ error: 'wallet query param is required.' });
  const user = await prisma.user.findUnique({ where: { smartWalletAddress: wallet } });
  if (!user) return res.status(404).json({ error: 'No account for that wallet.' });
  return res.json({ email: user.email, name: user.name, phone: user.phone });
});

// 2. Link a passkey smart wallet to the onboarded user (after wallet creation).
router.post('/link-wallet', async (req, res) => {
  const { email, smartWalletAddress, passkeyKeyId } = req.body;
  if (!email || !smartWalletAddress) return res.status(400).json({ error: 'email and smartWalletAddress are required.' });
  if (!isValidSorobanAddress(smartWalletAddress)) return res.status(400).json({ error: 'Invalid smart wallet address.' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'No onboarded user for that email (do BVN first).' });

    await prisma.user.update({
      where: { id: user.id },
      data: { smartWalletAddress, passkeyKeyId: passkeyKeyId ?? null },
    });

    // Seed the brand-new smart wallet with test tokens from the relayer so the user can trade
    // immediately (friendbot can't fund contract addresses). Best-effort — never blocks linking.
    let seeded: SeedResult[] = [];
    try {
      seeded = await seedWalletFromEnv(smartWalletAddress);
      if (seeded.length) console.log(`[kyc/link-wallet] seeded ${smartWalletAddress}:`, seeded);
    } catch (seedErr) {
      console.error('[kyc/link-wallet] seeding failed (non-fatal):', seedErr);
    }
    return res.json({ success: true, seeded });
  } catch (err) {
    // e.g. the smartWalletAddress unique constraint (already linked to another account).
    console.error('[kyc/link-wallet]', err);
    return res.status(409).json({ error: 'Could not link wallet (it may already be linked).' });
  }
});

export default router;
