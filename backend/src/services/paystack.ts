import crypto from 'crypto';

const BASE = 'https://api.paystack.co';
function secret(): string { return process.env.PAYSTACK_SECRET_KEY || ''; }
function authHeaders() { return { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' }; }

/** Verifies a Paystack webhook: HMAC-SHA512 of the raw body with the secret key. */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const key = secret();
  if (!signature || !key || !rawBody) return false;
  const hash = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface VirtualAccount { accountNumber: string; bankName: string; reference: string; }

/** Creates (or reuses) a customer, then assigns a dedicated virtual account for this trade. */
export async function createVirtualAccount(params: { email: string; tradeId: string }): Promise<VirtualAccount> {
  const custRes = await fetch(`${BASE}/customer`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: params.email }) });
  const cust: any = await custRes.json();
  if (!cust.status) throw new Error(`Paystack customer error: ${cust.message}`);

  const daRes = await fetch(`${BASE}/dedicated_account`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ customer: cust.data.customer_code, preferred_bank: 'test-bank' }),
  });
  const da: any = await daRes.json();
  if (!da.status) throw new Error(`Paystack dedicated_account error: ${da.message}`);

  return { accountNumber: da.data.account_number, bankName: da.data.bank?.name ?? 'unknown', reference: da.data.account_number };
}

/** Sends Naira to the seller: create a transfer recipient, then initiate the transfer. Returns the transfer reference. */
export async function payoutToSeller(params: { amountKobo: number; accountNumber: string; bankCode: string; name: string }): Promise<string> {
  const recRes = await fetch(`${BASE}/transferrecipient`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ type: 'nuban', name: params.name, account_number: params.accountNumber, bank_code: params.bankCode, currency: 'NGN' }),
  });
  const rec: any = await recRes.json();
  if (!rec.status) throw new Error(`Paystack recipient error: ${rec.message}`);

  const trRes = await fetch(`${BASE}/transfer`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ source: 'balance', amount: params.amountKobo, recipient: rec.data.recipient_code, reason: 'ShieldPass P2P payout' }),
  });
  const tr: any = await trRes.json();
  if (!tr.status) throw new Error(`Paystack transfer error: ${tr.message}`);
  return tr.data.reference;
}
