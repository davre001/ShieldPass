import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db';

const touchedEmails: string[] = [];
const originalFiatMode = process.env.FIAT_MODE;
const originalPaystackKey = process.env.PAYSTACK_SECRET_KEY;
const originalLencoKey = process.env.LENCO_API_KEY;
const originalLencoAccount = process.env.LENCO_ACCOUNT_ID;
const originalContractId = process.env.STELLAR_CONTRACT_ID;
const originalRelayerSecret = process.env.STELLAR_RELAYER_SECRET;
const originalSwapPriceMode = process.env.SWAP_PRICE_MODE;

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function createUser(email: string) {
  touchedEmails.push(email);
  return prisma.user.create({ data: { email } });
}

afterEach(async () => {
  restoreEnv('FIAT_MODE', originalFiatMode);
  restoreEnv('PAYSTACK_SECRET_KEY', originalPaystackKey);
  restoreEnv('LENCO_API_KEY', originalLencoKey);
  restoreEnv('LENCO_ACCOUNT_ID', originalLencoAccount);
  restoreEnv('STELLAR_CONTRACT_ID', originalContractId);
  restoreEnv('STELLAR_RELAYER_SECRET', originalRelayerSecret);
  restoreEnv('SWAP_PRICE_MODE', originalSwapPriceMode);

  for (const email of touchedEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.notification.deleteMany({ where: { email } });
    await prisma.swap.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  touchedEmails.length = 0;
});

describe('POST /swap/execute state accounting', () => {
  const body = (email: string) => ({
    email,
    ephemeralBankDetails: {
      accountNumber: '0123456789',
      bankName: 'Access Bank',
      accountName: 'Test User',
    },
    tokenAddress: 'TOKEN_XLM',
    cryptoAmount: 250,
    cryptoAmountUnits: '250',
    assetCode: 'XLM',
    onChainSwapId: '7',
  });

  it('keeps swap claim-pending when fiat succeeds but chain claim is not configured', async () => {
    process.env.FIAT_MODE = 'mock';
    process.env.SWAP_PRICE_MODE = 'static';
    delete process.env.STELLAR_CONTRACT_ID;
    delete process.env.STELLAR_RELAYER_SECRET;
    const email = `swap_ok_${Date.now()}@test.com`;
    const user = await createUser(email);

    const res = await request(app).post('/swap/execute').send(body(email));

    expect(res.status).toBe(200);
    expect(res.body.swap.status).toBe('FIAT_SENT_CLAIM_PENDING');
    const row = await prisma.swap.findFirst({ where: { userId: user.id } });
    expect(row?.status).toBe('FIAT_SENT_CLAIM_PENDING');
    expect(row?.assetCode).toBe('XLM');
    expect(row?.tokenLabel).toBe('XLM');
    expect(row?.cryptoAmountUnits).toBe('250');
    expect(row?.nairaAmountKobo).toMatch(/^\d+$/);
    expect(row?.quoteRateNaira).toBeGreaterThan(0);
  });

  it('does not mark a fiat failure as refunded before on-chain refund', async () => {
    process.env.FIAT_MODE = 'live';
    process.env.SWAP_PRICE_MODE = 'static';
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.LENCO_API_KEY;
    delete process.env.LENCO_ACCOUNT_ID;
    const email = `swap_fail_${Date.now()}@test.com`;
    const user = await createUser(email);

    const res = await request(app).post('/swap/execute').send(body(email));

    expect(res.status).toBe(502);
    const row = await prisma.swap.findFirst({ where: { userId: user.id } });
    expect(row?.status).toBe('FIAT_FAILED_REFUND_PENDING');
  });

  it('quotes USDC with explicit asset metadata', async () => {
    process.env.SWAP_PRICE_MODE = 'static';

    const res = await request(app).post('/swap/quote').send({
      tokenAddress: 'TOKEN_USDC',
      cryptoAmount: 10,
      assetCode: 'USDC',
    });

    expect(res.status).toBe(200);
    expect(res.body.assetCode).toBe('USDC');
    expect(res.body.tokenLabel).toBe('USDC');
    expect(res.body.nairaAmount).toBeGreaterThan(0);
    expect(res.body.source).toBe('fallback');
  });
});
