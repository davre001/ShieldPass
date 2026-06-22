import type { Trade, HistoryItem } from '../types';

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
  submitBvn: (input: { email: string; phone?: string; bvn: string; pin: string }) =>
    request<{ success: boolean; returnedName: string; secretSalt: string; merkleRoot: string; leafIndex: number }>(
      '/kyc/submit-bvn', { method: 'POST', body: JSON.stringify(input) }),

  verifyPin: (input: { email: string; pin: string }) =>
    request<{ ok: boolean }>('/kyc/verify-pin', { method: 'POST', body: JSON.stringify(input) }),

  linkWallet: (input: { email: string; smartWalletAddress: string; passkeyKeyId?: string }) =>
    request<{ success: boolean }>('/kyc/link-wallet', { method: 'POST', body: JSON.stringify(input) }),

  listTrades: () => request<Trade[]>('/p2p/trades'),

  getTrade: (id: string) => request<Trade>(`/p2p/trades/${id}`),

  getHistory: (wallet: string, status?: string, page = 1, limit = 20) =>
    request<HistoryItem[]>(`/p2p/history?wallet=${encodeURIComponent(wallet)}${status ? `&status=${status}` : ''}&page=${page}&limit=${limit}`),

  getActive: (wallet: string) =>
    request<HistoryItem[]>(`/p2p/trades/active?wallet=${encodeURIComponent(wallet)}`),

  createTrade: (input: {
    sellerWallet: string; assetType: string; cryptoAmount: string; nairaRate: string;
    sellerBankAccount: string; escrowOfferId: string;
    proof: string; publicInputs: string[]; nullifier: string;
  }) => request<{ success: boolean; trade: Trade }>('/p2p/trades', { method: 'POST', body: JSON.stringify(input) }),

  acceptTrade: (id: string, input: {
    buyerWallet: string; buyerEmail: string; proof: string; publicInputs: string[]; nullifier: string;
  }) => request<{ success: boolean; trade: Trade; payTo: { accountNumber: string; bankName: string; amount: string }; message: string }>(
    `/p2p/trades/${id}/accept`, { method: 'POST', body: JSON.stringify(input) }),
};