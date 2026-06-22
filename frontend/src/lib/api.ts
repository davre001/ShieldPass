import type { BankAccount, Quote, SwapRecord } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Real backend client ──
export const api = {
  // Tier 1: passkey-first onboarding. Links the smart wallet and returns the compliance salt.
  linkWallet: (input: { email: string; pin?: string; smartWalletAddress: string; passkeyKeyId?: string }) =>
    request<{ success: boolean; tier: number; secretSalt: string; merkleRoot: string; leafIndex: number }>(
      '/kyc/link-wallet', { method: 'POST', body: JSON.stringify(input) }),

  // Tier 2: BVN upgrade for high-value swaps. Returns a NEW (bvn-verified) compliance salt.
  submitBvn: (input: { email: string; phone?: string; bvn: string }) =>
    request<{ success: boolean; tier: number; returnedName: string; secretSalt: string; merkleRoot: string; leafIndex: number }>(
      '/kyc/submit-bvn', { method: 'POST', body: JSON.stringify(input) }),

  verifyPin: (input: { email: string; pin: string }) =>
    request<{ ok: boolean }>('/kyc/verify-pin', { method: 'POST', body: JSON.stringify(input) }),

  // Login on a new device: recover the account from the wallet the passkey identified.
  getAccount: (wallet: string) =>
    request<{ email: string; name: string | null; phone: string | null; bvnVerified: boolean }>(
      `/kyc/account?wallet=${encodeURIComponent(wallet)}`),

  // Login on a new device: mint a fresh compliance salt (the salt is client-only, unrecoverable).
  reissueSalt: (input: { email: string; pin: string }) =>
    request<{ success: boolean; bvnVerified: boolean; secretSalt: string; merkleRoot: string; leafIndex: number }>(
      '/kyc/reissue-salt', { method: 'POST', body: JSON.stringify(input) }),

  // ── Bank accounts ──
  listBanks: (email: string) =>
    request<BankAccount[]>(`/banks?email=${encodeURIComponent(email)}`),

  addBank: (input: { email: string; bankName: string; accountNumber: string; accountName: string; isDefault?: boolean }) =>
    request<{ success: boolean; account: BankAccount }>('/banks', { method: 'POST', body: JSON.stringify(input) }),

  // ── Swap ──
  quote: (input: { tokenAddress: string; cryptoAmount: number; assetCode?: string }) =>
    request<Quote>('/swap/quote', { method: 'POST', body: JSON.stringify(input) }),

  executeSwap: (input: {
    email: string; bankAccountId: string; tokenAddress: string; cryptoAmount: number; assetCode?: string;
    onChainSwapId: string; proof: string; publicInputs: string[]; nullifier: string;
  }) => request<{ success: boolean; swap: SwapRecord; payout: { amountNaira: number; bank: string; transferId: string }; message: string }>(
    '/swap/execute', { method: 'POST', body: JSON.stringify(input) }),

  swapHistory: (email: string) =>
    request<SwapRecord[]>(`/swap/history?email=${encodeURIComponent(email)}`),
};
