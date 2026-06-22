import { Router } from 'express';
import { TrustedIssuer, isValidSorobanAddress } from '@shieldpass/sdk';
import { prisma } from '../db';
import { verifyBvn } from '../services/bvn';
import { hashPin, verifyPin } from '../services/pin';
import { seedWalletFromEnv, type SeedResult } from '../services/seed';

const router = Router();
const issuer = new TrustedIssuer();

// Re-issue a compliance leaf from the user's current Tier flags and persist it.
// hardwareAttested is always true once a passkey is linked; bvnVerified flips to true at Tier 2.
async function issueLeaf(userId: string, hardwareAttested: boolean, bvnVerified: boolean) {
  const goodStanding = true;
  const secretSalt = issuer.generateSecretSalt();
  const leafCommitment = issuer.generateLeaf(BigInt(secretSalt), hardwareAttested, bvnVerified, goodStanding);
  const { merkle_root } = issuer.generateMerkleProof(leafCommitment);
  await prisma.complianceAttestation.upsert({
    where: { userId },
    update: { leafCommitment, merkleRoot: merkle_root, leafIndex: 0, hardwareAttested, bvnVerified, goodStanding },
    create: { userId, leafCommitment, merkleRoot: merkle_root, leafIndex: 0, hardwareAttested, bvnVerified, goodStanding },
  });
  return { secretSalt, merkleRoot: merkle_root, leafIndex: 0 };
}

// ── Tier 1: Passkey-first onboarding ──
// Link a freshly-created passkey smart wallet to the user (creating the user if needed).
// Issues a Tier 1 compliance leaf (hardwareAttested = true, bvnVerified = false) and returns the
// secret salt. NO BVN required here — small swaps only need the hardware (passkey) attestation.
router.post('/link-wallet', async (req, res) => {
  const { email, pin, smartWalletAddress, passkeyKeyId } = req.body;
  if (!email || !smartWalletAddress) return res.status(400).json({ error: 'email and smartWalletAddress are required.' });
  if (!isValidSorobanAddress(smartWalletAddress)) return res.status(400).json({ error: 'Invalid smart wallet address.' });
  if (pin && !/^\d{4,6}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4-6 digits.' });

  try {
    const pinHash = pin ? hashPin(String(pin)) : undefined;
    // Passkey-first: the user may not exist yet (no upfront BVN). Create or update by email.
    const user = await prisma.user.upsert({
      where: { email },
      update: { smartWalletAddress, passkeyKeyId: passkeyKeyId ?? null, ...(pinHash ? { pinHash } : {}) },
      create: { email, smartWalletAddress, passkeyKeyId: passkeyKeyId ?? null, pinHash },
    });

    // Tier 1 leaf: hardware-attested, not yet BVN-verified.
    const leaf = await issueLeaf(user.id, true, false);

    // Seed the brand-new smart wallet with test tokens (best-effort, never blocks linking).
    let seeded: SeedResult[] = [];
    try {
      seeded = await seedWalletFromEnv(smartWalletAddress);
      if (seeded.length) console.log(`[kyc/link-wallet] seeded ${smartWalletAddress}:`, seeded);
    } catch (seedErr) {
      console.error('[kyc/link-wallet] seeding failed (non-fatal):', seedErr);
    }

    return res.json({ success: true, tier: 1, ...leaf, seeded });
  } catch (err) {
    console.error('[kyc/link-wallet]', err);
    return res.status(409).json({ error: 'Could not link wallet (it may already be linked).' });
  }
});

// ── Tier 2: BVN upgrade ──
// Triggered when a user wants to swap above the high-value threshold. Verifies the BVN, records the
// legal name, and issues a NEW compliance leaf with bvnVerified = true. Returns the new secret salt.
router.post('/submit-bvn', async (req, res) => {
  const { email, phone, bvn } = req.body;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email is required.' });
  if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
    return res.status(400).json({ error: 'A valid 11-digit numeric BVN is required.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'No account for that email (link a wallet first).' });

    const check = await verifyBvn(bvn);
    if (!check.ok) return res.status(400).json({ error: 'BVN verification failed.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { name: check.returnedName, phone: phone ?? user.phone ?? undefined },
    });

    // Tier 2 leaf: hardware-attested AND BVN-verified.
    const leaf = await issueLeaf(user.id, true, true);

    return res.json({
      success: true,
      tier: 2,
      message: 'BVN verified. Identity upgraded — high-value swaps unlocked.',
      returnedName: check.returnedName,
      ...leaf,
    });
  } catch (err) {
    console.error('[kyc/submit-bvn]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Verify a returning user's PIN (second factor for passkey reconnect).
router.post('/verify-pin', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'email and pin are required.' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'No user for that email.' });
  const ok = !!user.pinHash && verifyPin(String(pin), user.pinHash);
  return res.json({ 
    ok, 
    passkeyKeyId: ok ? user.passkeyKeyId : undefined,
    smartWalletAddress: ok ? user.smartWalletAddress : undefined
  });
});

// Re-issue a fresh compliance secret salt for a returning user (login on a new device).
// Preserves the user's current Tier (hardwareAttested / bvnVerified) so they keep their level.
router.post('/reissue-salt', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'email and pin are required.' });
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { attestation: true } });
    if (!user) return res.status(404).json({ error: 'No user for that email.' });
    if (!user.pinHash || !verifyPin(String(pin), user.pinHash)) return res.status(401).json({ error: 'Incorrect PIN.' });
    if (!user.attestation) return res.status(409).json({ error: 'Link a wallet before logging in.' });

    const leaf = await issueLeaf(user.id, user.attestation.hardwareAttested, user.attestation.bvnVerified);
    return res.json({ success: true, bvnVerified: user.attestation.bvnVerified, ...leaf });
  } catch (err) {
    console.error('[kyc/reissue-salt]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Look up the account linked to a smart wallet — used by login on a new device.
router.get('/account', async (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!wallet) return res.status(400).json({ error: 'wallet query param is required.' });
  const user = await prisma.user.findUnique({ where: { smartWalletAddress: wallet }, include: { attestation: true } });
  if (!user) return res.status(404).json({ error: 'No account for that wallet.' });
  return res.json({ email: user.email, name: user.name, phone: user.phone, bvnVerified: user.attestation?.bvnVerified ?? false });
});

export default router;
