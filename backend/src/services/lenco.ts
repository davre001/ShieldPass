/**
 * Lenco Business Banking — outward Naira payouts (instant settlement).
 *
 * Drives the fiat leg of the Trustless Instant Swap: once the user's crypto is time-locked
 * on-chain, the backend pushes Naira to the user's bank account here, then claims the crypto.
 *
 * MOCK for the hackathon unless LENCO_API_KEY is set: returns a deterministic successful
 * transfer so the full swap lifecycle can be demoed end-to-end. With a real key it POSTs to the
 * Lenco transfers API behind the same signature.
 */

const LENCO_API_KEY = process.env.LENCO_API_KEY || '';
const LENCO_API_URL = process.env.LENCO_API_URL || 'https://api.lenco.co/access/v1';
const LENCO_ACCOUNT_ID = process.env.LENCO_ACCOUNT_ID || '';

export interface LencoTransferInput {
  amountNaira: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
  /** NUBAN bank code, if known (real Lenco API requires it). */
  bankCode?: string;
  /** Idempotency / tracking reference, e.g. the swap id. */
  reference: string;
}

export interface LencoTransferResult {
  ok: boolean;
  transferId: string;
  status: 'successful' | 'pending' | 'failed';
  error?: string;
}

/**
 * Initiate an instant Naira transfer to the user's bank account.
 * Returns a transfer id and its status. Throws only on unexpected errors.
 */
export async function initiateTransfer(input: LencoTransferInput): Promise<LencoTransferResult> {
  if (!(input.amountNaira > 0)) return { ok: false, transferId: '', status: 'failed', error: 'Amount must be positive.' };
  if (!input.accountNumber) return { ok: false, transferId: '', status: 'failed', error: 'accountNumber is required.' };

  // Mock mode: no API key configured — simulate an instant successful payout.
  if (!LENCO_API_KEY) {
    const transferId = `mock_lenco_${input.reference}_${Date.now()}`;
    console.log(`[lenco] MOCK transfer ₦${input.amountNaira} -> ${input.bankName} ${input.accountNumber} (${input.accountName})`);
    return { ok: true, transferId, status: 'successful' };
  }

  // Real Lenco transfer.
  try {
    const res = await fetch(`${LENCO_API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LENCO_API_KEY}` },
      body: JSON.stringify({
        accountId: LENCO_ACCOUNT_ID,
        amount: input.amountNaira,
        currency: 'NGN',
        narration: `ShieldPass swap ${input.reference}`,
        reference: input.reference,
        recipient: {
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
          accountName: input.accountName,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, transferId: '', status: 'failed', error: data?.message || `Lenco error ${res.status}` };
    }
    const tx = data?.data ?? data;
    const status = (tx?.status as LencoTransferResult['status']) || 'pending';
    return { ok: status !== 'failed', transferId: String(tx?.id || tx?.reference || input.reference), status };
  } catch (err) {
    return { ok: false, transferId: '', status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
