import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from './db';

const createdTradeIds: string[] = [];
const createdEventIds: string[] = [];

afterEach(async () => {
  if (createdTradeIds.length) await prisma.trade.deleteMany({ where: { id: { in: createdTradeIds } } });
  if (createdEventIds.length) await prisma.webhookEvent.deleteMany({ where: { providerEventId: { in: createdEventIds } } });
  createdTradeIds.length = 0;
  createdEventIds.length = 0;
});

describe('Trade model', () => {
  it('creates a trade defaulting to OPEN with the required fields', async () => {
    const t = await prisma.trade.create({
      data: {
        assetType: 'USDC',
        cryptoAmount: '100',
        nairaRate: '1650',
        expectedAmount: '165000',
        sellerWallet: 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTW',
        sellerBankAccount: 'GTBank 0123456789',
      },
    });
    createdTradeIds.push(t.id);
    expect(t.status).toBe('OPEN');
    expect(t.buyerWallet).toBeNull();
    expect(t.expectedAmount).toBe('165000');
  });
});

describe('WebhookEvent idempotency', () => {
  it('rejects a duplicate providerEventId', async () => {
    const eventId = `evt_test_${Date.now()}`;
    createdEventIds.push(eventId);
    await prisma.webhookEvent.create({ data: { providerEventId: eventId, type: 'charge.success' } });
    await expect(
      prisma.webhookEvent.create({ data: { providerEventId: eventId, type: 'charge.success' } }),
    ).rejects.toThrow();
  });
});
