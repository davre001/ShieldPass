import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
// import { buildPoseidon } from 'circomlibjs'; 
// (For the hackathon, we would use poseidon to hash the secret salt + flags)

const router = Router();
const prisma = new PrismaClient();

// 1. Mock BVN Onboarding
router.post('/submit-bvn', async (req, res) => {
  const { walletAddress, bvn } = req.body;

  if (!walletAddress || !bvn || bvn.length !== 11) {
    return res.status(400).json({ error: 'Valid Wallet Address and 11-digit BVN required.' });
  }

  try {
    // Upsert User
    let user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) {
      user = await prisma.user.create({ data: { walletAddress } });
    }

    // Mock "Light KYC" Verification (always returns true for hackathon)
    const secretSalt = Math.floor(Math.random() * 1000000000).toString(); // Simplification
    const isHuman = 1;
    const bvnVerified = 1;
    const goodStanding = 1;

    // TODO: In a real environment, compute Poseidon Hash of [secretSalt, isHuman, bvnVerified, goodStanding]
    // and insert into an off-chain Merkle Tree.
    const mockLeafCommitment = "0xMockHash";
    const mockLeafIndex = 1;

    // Store attestation details (but NOT the secret salt)
    await prisma.complianceAttestation.upsert({
      where: { userId: user.id },
      update: { leafCommitment: mockLeafCommitment, leafIndex: mockLeafIndex },
      create: { 
        userId: user.id, 
        leafCommitment: mockLeafCommitment, 
        leafIndex: mockLeafIndex,
        isHuman: true,
        bvnVerified: true,
        goodStanding: true
      }
    });

    // Return the secret salt to the user ONE TIME ONLY
    return res.json({
      success: true,
      message: 'BVN Verified. Keep this secret salt safe for ZK Proofs.',
      secretSalt,
      mockLeafCommitment,
      mockLeafIndex
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
