import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyWebhook, createVirtualAccount, payoutToSeller } from './paystack';

const SECRET = 'sk_test_dummy';
beforeEach(() => { process.env.PAYSTACK_SECRET_KEY = SECRET; });
afterEach(() => { vi.restoreAllMocks(); });

function sign(body: string) {
  return crypto.createHmac('sha512', SECRET).update(body).digest('hex');
}

describe('verifyWebhook', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    expect(verifyWebhook(body, sign(body))).toBe(true);
  });
  it('rejects a tampered body', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    expect(verifyWebhook(body + 'x', sign(body))).toBe(false);
  });
  it('rejects a missing signature', () => {
    expect(verifyWebhook('{}', '')).toBe(false);
  });
});

describe('createVirtualAccount', () => {
  it('creates a customer then a dedicated account and returns the number', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: true, data: { customer_code: 'CUS_1' } }) })
      .mockResolvedValueOnce({ json: async () => ({ status: true, data: { account_number: '1234567890', bank: { name: 'Test Bank' } } }) });
    vi.stubGlobal('fetch', fetchMock);

    const va = await createVirtualAccount({ email: 'buyer@test.com', tradeId: 't1' });
    expect(va.accountNumber).toBe('1234567890');
    expect(va.reference).toBe('1234567890');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('payoutToSeller', () => {
  it('creates a recipient then a transfer and returns the reference', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: true, data: { recipient_code: 'RCP_1' } }) })
      .mockResolvedValueOnce({ json: async () => ({ status: true, data: { reference: 'trf_abc' } }) });
    vi.stubGlobal('fetch', fetchMock);

    const ref = await payoutToSeller({ amountKobo: 16_500_000, accountNumber: '0123456789', bankCode: '058', name: 'Seller' });
    expect(ref).toBe('trf_abc');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
