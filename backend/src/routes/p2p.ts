import { Router } from 'express';
import { isValidStellarAddress } from '@shieldpass/sdk';
import { prisma } from '../db';

const router = Router();

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

  // Field validation
  if (!sellerWallet || !assetType || !cryptoAmount || !nairaRate || !bankDetails) {
    return res.status(400).json({ error: 'All fields required: sellerWallet, assetType, cryptoAmount, nairaRate, bankDetails.' });
  }
  if (!isValidStellarAddress(sellerWallet)) {
    return res.status(400).json({ error: 'Invalid Stellar wallet address format.' });
  }
  const VALID_ASSETS = ['USDC', 'XLM', 'NGNC'];
  if (!VALID_ASSETS.includes(assetType.toUpperCase())) {
    return res.status(400).json({ error: `assetType must be one of: ${VALID_ASSETS.join(', ')}` });
  }
  if (isNaN(Number(cryptoAmount)) || Number(cryptoAmount) <= 0) {
    return res.status(400).json({ error: 'cryptoAmount must be a positive number.' });
  }
  if (isNaN(Number(nairaRate)) || Number(nairaRate) <= 0) {
    return res.status(400).json({ error: 'nairaRate must be a positive number.' });
  }

  try {
    const newOffer = await prisma.p2POffer.create({
      data: {
        sellerWallet,
        assetType: assetType.toUpperCase(),
        cryptoAmount: String(cryptoAmount),
        nairaRate: String(nairaRate),
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
  const { buyerWallet } = req.body;

  if (!buyerWallet) {
    return res.status(400).json({ error: 'buyerWallet is required.' });
  }
  if (!isValidStellarAddress(buyerWallet)) {
    return res.status(400).json({ error: 'Invalid Stellar buyer wallet address format.' });
  }

  try {
    const offer = await prisma.p2POffer.findUnique({ where: { id } });
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found.' });
    }
    if (offer.status !== 'open') {
      return res.status(400).json({ error: `Offer is not available. Current status: ${offer.status}` });
    }
    if (offer.sellerWallet === buyerWallet) {
      return res.status(400).json({ error: 'You cannot accept your own offer.' });
    }

    const updatedOffer = await prisma.p2POffer.update({
      where: { id },
      data: { status: 'locked' }
    });

    res.json({ success: true, message: 'Offer locked. Send Naira to the bank details provided, then notify the seller.', offer: updatedOffer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

export default router;
