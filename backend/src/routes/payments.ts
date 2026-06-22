import { Router } from 'express';
import { prisma } from '../db';
import { verifyWebhook } from '../services/paystack';
import { settleTrade, defaultSettlementDeps } from '../services/settlement';
import { emitTradeUpdate } from '../services/tradeEvents';

const router = Router();

// Paystack calls this when money lands in a virtual account.
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'] as string;
  const rawBody = (req as any).rawBody as string;
  if (!verifyWebhook(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;
  const eventId = event?.data?.id ? String(event.data.id) : null;
  if (!eventId) return res.status(400).json({ error: 'Missing event id' });

  // Idempotency: first writer wins; a duplicate event is acked and dropped.
  try {
    await prisma.webhookEvent.create({ data: { providerEventId: eventId, type: event.event } });
  } catch {
    return res.status(200).json({ status: 'duplicate ignored' });
  }

  if (event.event === 'charge.success') {
    const ref = event.data?.reference;
    const trade = await prisma.trade.findFirst({ where: { virtualAccountRef: ref, status: 'AWAITING_PAYMENT' } });
    if (trade) {
      const paid = await prisma.trade.update({ where: { id: trade.id }, data: { status: 'PAID', paidAt: new Date() } });
      emitTradeUpdate(paid);
      await prisma.webhookEvent.update({ where: { providerEventId: eventId }, data: { tradeId: trade.id } });
      try {
        await settleTrade(trade.id, defaultSettlementDeps());
      } catch (e) {
        console.error('[payments] settlement failed (trade left PAID for retry):', e);
      }
    }
  }
  return res.status(200).json({ status: 'ok' });
});

export default router;
