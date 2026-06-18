import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// 1. List all active P2P offers
router.get('/offers', async (req, res) => {
  try {
    const offers = await prisma.p2POffer.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' }
    });
    res.json(offers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// 2. Create a new P2P offer (Seller locks crypto on-chain, then registers here)
router.post('/offers', async (req, res) => {
  const { sellerWallet, assetType, cryptoAmount, nairaRate, bankDetails } = req.body;

  try {
    const newOffer = await prisma.p2POffer.create({
      data: {
        sellerWallet,
        assetType,
        cryptoAmount,
        nairaRate,
        bankDetails,
        status: 'open'
      }
    });

    res.json({ success: true, offer: newOffer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

// 3. Buyer accepts an offer (Locks it so others can't take it)
router.post('/offers/:id/accept', async (req, res) => {
  const { id } = req.params;
  const { buyerWallet } = req.body; // In a real app, verify buyer's ZK Proof here too

  try {
    const offer = await prisma.p2POffer.findUnique({ where: { id } });
    if (!offer || offer.status !== 'open') {
      return res.status(400).json({ error: 'Offer is not available' });
    }

    const updatedOffer = await prisma.p2POffer.update({
      where: { id },
      data: { status: 'locked' }
    });

    res.json({ success: true, message: 'Offer locked. Proceed to send Fiat to the bank details provided.', offer: updatedOffer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

export default router;
