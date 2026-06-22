import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { prisma } from '../db';

// Replace the settlement module so the route doesn't touch Stellar/Paystack.
vi.mock('../services/settlement', () => ({
  settleTrade: vi.fn().mockResolvedValue(undefined),
  defaultSettlementDeps: vi.fn(() => ({})),
}));

import { app } from '../app';
import { settleTrade } from '../services/settlement';

const SECRET = 'sk_test_dummy';
beforeEach(() => { process.env.PAYSTACK_SECRET_KEY = SECRET; });

const tradeIds: string[] = [];
const eventIds: string[] = [];
afterEach(async () => {
  if (tradeIds.length) await prisma.trade.deleteMany({ where: { id: { in: tradeIds } } });
  if (eventIds.length) await prisma.webhookEvent.deleteMany({ where: { providerEventId: { in: eventIds } } });
  tradeIds.length = 0; eventIds.length = 0;
  vi.clearAllMocks();
});

function sign(body: string) { return crypto.createHmac('sha512', SECRET).update(body).digest('hex'); }

async function awaitingTrade(ref: string) {
  const t = await prisma.trade.create({
    data: {
      status: 'AWAITING_PAYMENT', assetType: 'USDC', cryptoAmount: '100', nairaRate: '1650',
      expectedAmount: '165000', sellerWallet: 'GSELLER', sellerBankAccount: '058:0123456789:Seller',
      buyerWallet: 'GBUYER', escrowOfferId: '1', virtualAccountRef: ref,
    },
  });
  tradeIds.push(t.id);
  return t;
}

describe('POST /payments/webhook', () => {
  it('rejects an invalid signature with 401', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { id: 1 } });
    const res = await request(app).post('/payments/webhook').set('x-paystack-signature', 'bad').type('json').send(body);
    expect(res.status).toBe(401);
  });

  it('on charge.success marks the trade PAID and triggers settlement', async () => {
    const ref = `acct_${Date.now()}`;
    const t = await awaitingTrade(ref);
    const eventId = `evt_${Date.now()}`;
    eventIds.push(eventId);
    const body = JSON.stringify({ event: 'charge.success', data: { id: eventId, reference: ref } });

    const res = await request(app).post('/payments/webhook').set('x-paystack-signature', sign(body)).type('json').send(body);
    expect(res.status).toBe(200);

    const after = await prisma.trade.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('PAID');
    expect(settleTrade).toHaveBeenCalledWith(t.id, expect.anything());
  });

  it('ignores a duplicate event id (idempotent)', async () => {
    const ref = `acct_${Date.now()}_b`;
    await awaitingTrade(ref);
    const eventId = `evt_dup_${Date.now()}`;
    eventIds.push(eventId);
    const body = JSON.stringify({ event: 'charge.success', data: { id: eventId, reference: ref } });
    const sig = sign(body);

    await request(app).post('/payments/webhook').set('x-paystack-signature', sig).type('json').send(body);
    const res2 = await request(app).post('/payments/webhook').set('x-paystack-signature', sig).type('json').send(body);
    expect(res2.status).toBe(200);
    expect((settleTrade as any).mock.calls.length).toBe(1); // only the first call settled
  });
});
