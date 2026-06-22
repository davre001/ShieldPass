import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// List a user's saved bank accounts (by email).
router.get('/', async (req, res) => {
  const email = String(req.query.email || '');
  if (!email) return res.status(400).json({ error: 'email query param is required.' });
  const user = await prisma.user.findUnique({ where: { email }, include: { bankAccounts: true } });
  if (!user) return res.status(404).json({ error: 'No account for that email.' });
  res.json(user.bankAccounts.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)));
});

// Add a bank account for a user. First account added becomes the default.
router.post('/', async (req, res) => {
  const { email, bankName, accountNumber, accountName, isDefault } = req.body;
  if (!email || !bankName || !accountNumber || !accountName) {
    return res.status(400).json({ error: 'email, bankName, accountNumber and accountName are required.' });
  }
  const user = await prisma.user.findUnique({ where: { email }, include: { bankAccounts: true } });
  if (!user) return res.status(404).json({ error: 'No account for that email.' });

  const makeDefault = Boolean(isDefault) || user.bankAccounts.length === 0;
  if (makeDefault) {
    await prisma.bankAccount.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }
  const account = await prisma.bankAccount.create({
    data: { userId: user.id, bankName, accountNumber: String(accountNumber), accountName, isDefault: makeDefault },
  });
  res.json({ success: true, account });
});

// Mark a bank account as the default payout destination.
router.post('/:id/default', async (req, res) => {
  const { id } = req.params;
  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account) return res.status(404).json({ error: 'Bank account not found.' });
  await prisma.bankAccount.updateMany({ where: { userId: account.userId }, data: { isDefault: false } });
  const updated = await prisma.bankAccount.update({ where: { id }, data: { isDefault: true } });
  res.json({ success: true, account: updated });
});

export default router;
