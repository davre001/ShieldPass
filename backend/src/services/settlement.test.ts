import { describe, it, expect, vi, afterEach } from 'vitest';
import { prisma } from '../db';
import { settleTrade, type SettlementDeps } from './settlement';

const ids: string[] = [];
afterEach(async () => {
  if (ids.length) await prisma.trade.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
  vi.restoreAllMocks();
});

async function makePaidTrade() {
  const t = await prisma.trade.create({
    data: {
      status: 'PAID', assetType: 'USDC', cryptoAmount: '100', nairaRate: '1650',
      expectedAmount: '165000', sellerWallet: 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTW',
      sellerBankAccount: '058:0123456789:Seller', buyerWallet: 'GBUYER', escrowOfferId: '1',
    },
  });
  ids.push(t.id);
  return t;
}

describe('settleTrade', () => {
  it('releases crypto then pays out and marks SETTLED', async () => {
    const t = await makePaidTrade();
    const deps: SettlementDeps = {
      releaseCrypto: vi.fn().mockResolvedValue('tx_release_1'),
      payout: vi.fn().mockResolvedValue('trf_1'),
    };
    await settleTrade(t.id, deps);

    const after = await prisma.trade.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('SETTLED');
    expect(after?.releaseTxHash).toBe('tx_release_1');
    expect(after?.payoutRef).toBe('trf_1');
    expect(deps.releaseCrypto).toHaveBeenCalledWith(1n, 'GBUYER');
    expect(deps.payout).toHaveBeenCalledWith(16_500_000, '058:0123456789:Seller');
  });

  it('is idempotent — a second call does not release crypto again', async () => {
    const t = await makePaidTrade();
    const deps: SettlementDeps = { releaseCrypto: vi.fn().mockResolvedValue('tx1'), payout: vi.fn().mockResolvedValue('trf1') };
    await settleTrade(t.id, deps);
    await settleTrade(t.id, deps); // already SETTLED -> no-op
    expect((deps.releaseCrypto as any).mock.calls.length).toBe(1);
  });
});
