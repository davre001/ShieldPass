import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../db';

vi.mock('../services/compliance', () => ({
  checkProof: vi.fn().mockResolvedValue({ ok: true }),
  burnNullifier: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/paystack', () => ({
  createVirtualAccount: vi.fn().mockResolvedValue({ accountNumber: '1234567890', bankName: 'Test Bank', reference: '1234567890' }),
}));

import { app } from '../app';
import { checkProof } from '../services/compliance';
import { expireStaleTrades } from './trades';

const SELLER = 'GDSNLVSSQJI3YNKCBEU6CP2D5OWQIWX7YETVY2DIZJBRKDBIRINIET7G';
const BUYER = 'GD6WU64OEP5C27ANXYOL7HVZILYHB7QYZTDOQRTHIQDBYTZBNNJYHC4D';
const tradeIds: string[] = [];
const nullifiers: string[] = [];
afterEach(async () => {
  if (tradeIds.length) await prisma.trade.deleteMany({ where: { id: { in: tradeIds } } });
  if (nullifiers.length) await prisma.nullifier.deleteMany({ where: { value: { in: nullifiers } } });
  tradeIds.length = 0; nullifiers.length = 0; vi.clearAllMocks();
});

function proofBody(extra: object) {
  return { proof: '0xabc', publicInputs: ['0'], nullifier: `n_${Date.now()}_${Math.random()}`, ...extra };
}

describe('POST /p2p/trades (create)', () => {
  it('creates an OPEN trade when the seller proof is valid', async () => {
    const res = await request(app).post('/p2p/trades').send(proofBody({
      sellerWallet: SELLER, assetType: 'USDC', cryptoAmount: '100', nairaRate: '1650',
      sellerBankAccount: '058:0123456789:Seller', escrowOfferId: '1',
    }));
    expect(res.status).toBe(200);
    expect(res.body.trade.status).toBe('OPEN');
    expect(res.body.trade.expectedAmount).toBe('165000');
    tradeIds.push(res.body.trade.id);
  });

  it('rejects when the proof check fails', async () => {
    (checkProof as any).mockResolvedValueOnce({ ok: false, status: 400, error: 'Invalid Zero-Knowledge Proof.' });
    const res = await request(app).post('/p2p/trades').send(proofBody({
      sellerWallet: SELLER, assetType: 'USDC', cryptoAmount: '100', nairaRate: '1650',
      sellerBankAccount: '058:0123456789:Seller', escrowOfferId: '1',
    }));
    expect(res.status).toBe(400);
  });
});

describe('POST /p2p/trades/:id/accept', () => {
  async function openTrade() {
    const t = await prisma.trade.create({ data: {
      status: 'OPEN', assetType: 'USDC', cryptoAmount: '100', nairaRate: '1650', expectedAmount: '165000',
      sellerWallet: SELLER, sellerBankAccount: '058:0123456789:Seller', escrowOfferId: '1',
    }});
    tradeIds.push(t.id);
    return t;
  }

  it('accepts: assigns buyer, issues a virtual account, sets AWAITING_PAYMENT', async () => {
    const t = await openTrade();
    const res = await request(app).post(`/p2p/trades/${t.id}/accept`).send(proofBody({ buyerWallet: BUYER, buyerEmail: 'buyer@test.com' }));
    expect(res.status).toBe(200);
    expect(res.body.payTo.accountNumber).toBe('1234567890');
    const after = await prisma.trade.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('AWAITING_PAYMENT');
    expect(after?.buyerWallet).toBe(BUYER);
    expect(after?.virtualAccountRef).toBe('1234567890');
    expect(after?.expiresAt).not.toBeNull();
  });

  it('rejects the seller accepting their own offer', async () => {
    const t = await openTrade();
    const res = await request(app).post(`/p2p/trades/${t.id}/accept`).send(proofBody({ buyerWallet: SELLER, buyerEmail: 'seller@test.com' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /p2p/trades', () => {
  it('lists OPEN trades', async () => {
    const t = await prisma.trade.create({ data: {
      status: 'OPEN', assetType: 'USDC', cryptoAmount: '5', nairaRate: '1600', expectedAmount: '8000',
      sellerWallet: SELLER, sellerBankAccount: '058:0123456789:Seller', escrowOfferId: '9',
    }});
    tradeIds.push(t.id);
    const res = await request(app).get('/p2p/trades');
    expect(res.status).toBe(200);
    expect(res.body.some((x: any) => x.id === t.id)).toBe(true);
  });
});

describe('expireStaleTrades', () => {
  it('cancels AWAITING_PAYMENT trades past their deadline', async () => {
    const t = await prisma.trade.create({ data: {
      status: 'AWAITING_PAYMENT', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
      sellerWallet: SELLER, sellerBankAccount: '058:1:S',
      escrowOfferId: '1', buyerWallet: 'GBUYER', virtualAccountRef: 'acct_x', expiresAt: new Date(Date.now() - 1000),
    }});
    tradeIds.push(t.id);
    const n = await expireStaleTrades();
    expect(n).toBeGreaterThanOrEqual(1);
    const after = await prisma.trade.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('CANCELLED');
  });
});

describe('GET /p2p/history', () => {
  const ME = 'GDSNLVSSQJI3YNKCBEU6CP2D5OWQIWX7YETVY2DIZJBRKDBIRINIET7G';

  it('returns trades where the wallet is buyer or seller, with a server-derived role', async () => {
    const sold = await prisma.trade.create({ data: {
      status: 'OPEN', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
      sellerWallet: ME, sellerBankAccount: '058:1:S', escrowOfferId: '1',
    }});
    const bought = await prisma.trade.create({ data: {
      status: 'SETTLED', assetType: 'XLM', cryptoAmount: '2', nairaRate: '1500', expectedAmount: '3000',
      sellerWallet: 'GOTHERSELLER', sellerBankAccount: '058:2:O', escrowOfferId: '2', buyerWallet: ME,
    }});
    tradeIds.push(sold.id, bought.id);
    const res = await request(app).get(`/p2p/history?wallet=${ME}`);
    expect(res.status).toBe(200);
    const rows = res.body as any[];
    expect(rows.find((t) => t.id === sold.id)?.role).toBe('seller');
    expect(rows.find((t) => t.id === bought.id)?.role).toBe('buyer');
  });

  it('filters by status', async () => {
    const open = await prisma.trade.create({ data: {
      status: 'OPEN', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
      sellerWallet: ME, sellerBankAccount: '058:1:S', escrowOfferId: '3',
    }});
    const settled = await prisma.trade.create({ data: {
      status: 'SETTLED', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
      sellerWallet: ME, sellerBankAccount: '058:1:S', escrowOfferId: '4',
    }});
    tradeIds.push(open.id, settled.id);
    const res = await request(app).get(`/p2p/history?wallet=${ME}&status=SETTLED`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((t) => t.id);
    expect(ids).toContain(settled.id);
    expect(ids).not.toContain(open.id);
  });

  it('returns [] for an unrelated wallet', async () => {
    const res = await request(app).get(`/p2p/history?wallet=GNOBODYWALLET`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('400 when wallet is missing', async () => {
    const res = await request(app).get('/p2p/history');
    expect(res.status).toBe(400);
  });
});

describe('GET /p2p/trades/active', () => {
  const ME = 'GDSNLVSSQJI3YNKCBEU6CP2D5OWQIWX7YETVY2DIZJBRKDBIRINIET7G';
  it('returns only non-terminal trades for the wallet, with role', async () => {
    const active = await prisma.trade.create({ data: {
      status: 'AWAITING_PAYMENT', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
      sellerWallet: ME, sellerBankAccount: '058:1:S', escrowOfferId: '1',
    }});
    const done = await prisma.trade.create({ data: {
      status: 'SETTLED', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
      sellerWallet: ME, sellerBankAccount: '058:1:S', escrowOfferId: '2',
    }});
    tradeIds.push(active.id, done.id);
    const res = await request(app).get(`/p2p/trades/active?wallet=${ME}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((t) => t.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(done.id);
    expect((res.body as any[]).find((t) => t.id === active.id)?.role).toBe('seller');
  });
  it('400 when wallet missing', async () => {
    const res = await request(app).get('/p2p/trades/active');
    expect(res.status).toBe(400);
  });
});

describe('GET /p2p/history pagination', () => {
  const ME = 'GD6WU64OEP5C27ANXYOL7HVZILYHB7QYZTDOQRTHIQDBYTZBNNJYHC4D';
  it('respects page + limit', async () => {
    for (let i = 0; i < 3; i++) {
      const t = await prisma.trade.create({ data: {
        status: 'OPEN', assetType: 'USDC', cryptoAmount: '1', nairaRate: '1600', expectedAmount: '1600',
        sellerWallet: ME, sellerBankAccount: '058:1:S', escrowOfferId: `pg${i}`,
      }});
      tradeIds.push(t.id);
    }
    const res = await request(app).get(`/p2p/history?wallet=${ME}&page=1&limit=2`);
    expect(res.status).toBe(200);
    expect((res.body as any[]).length).toBe(2);
  });
});
