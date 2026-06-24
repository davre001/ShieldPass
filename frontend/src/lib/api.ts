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
  linkWallet: (input: {
    email: string; pin?: string; smartWalletAddress: string; passkeyKeyId?: string;
    shieldedOwner?: string; shieldedEncPub?: string; shieldedAddress?: string;
  }) =>
    request<{
      success: boolean; tier: number; secretSalt: string; merkleRoot: string; leafIndex: number;
      faucetNote?: {
        amount: string; randomness: string; asset: string; leafIndex: number; commitment: string;
        compliance: { hardware_attested: string; bvn_verified: string; good_standing: string };
      };
    }>('/kyc/link-wallet', { method: 'POST', body: JSON.stringify(input) }),

  // Tier 2: BVN upgrade for high-value swaps. Returns a NEW (bvn-verified) compliance salt.
  submitBvn: (input: { email: string; phone?: string; bvn: string }) =>
    request<{ success: boolean; tier: number; returnedName: string; secretSalt: string; merkleRoot: string; leafIndex: number }>(
      '/kyc/submit-bvn', { method: 'POST', body: JSON.stringify(input) }),

  verifyPin: (input: { email: string; pin: string }) =>
    request<{ ok: boolean; passkeyKeyId?: string; smartWalletAddress?: string }>('/kyc/verify-pin', { method: 'POST', body: JSON.stringify(input) }),

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
    email: string;
    ephemeralBankDetails: { accountNumber: string; bankName: string; accountName: string };
    tokenAddress: string; cryptoAmount: number; assetCode?: string;
    onChainSwapId: string; nullifier?: string; changeCommitment?: string;
  }) => request<{ success: boolean; swap: SwapRecord; changeLeafIndex: number | null; payout: { amountNaira: number; bank: string; transferId: string }; message: string }>(
    '/swap/execute', { method: 'POST', body: JSON.stringify(input) }),

  swapHistory: (email: string) =>
    request<SwapRecord[]>(`/swap/history?email=${encodeURIComponent(email)}`),

  // ── Shielded tree ──
  // Advance the tree for a commitment the user just queued on-chain via deposit().
  treeInsert: (commitment: string) =>
    request<{ index: number; root: string }>('/tree/insert', { method: 'POST', body: JSON.stringify({ commitment }) }),

  // ── V2 private transfers ──
  // Resolve a recipient's published shielded identity (by email).
  lookupShielded: (email: string) =>
    request<{ owner: string; encPub: string; address: string | null }>(`/notes/identity/${encodeURIComponent(email)}`),
  // Post an encrypted note blob for the recipient to scan.
  postNoteBlob: (input: { commitment: string; ephemeralPub: string; ciphertext: string }) =>
    request<{ id: number }>('/notes/blob', { method: 'POST', body: JSON.stringify(input) }),
  // Scan for new note blobs since a cursor (recipient trial-decrypts them).
  scanNotes: (cursor: number) =>
    request<{ blobs: { id: number; commitment: string; ephemeralPub: string; ciphertext: string }[]; nextCursor: number }>(
      `/notes/since/${cursor}`),
  // Resolve a commitment to its tree leaf index (so a received note can be spent).
  treeIndexOf: (commitment: string) =>
    request<{ index: number }>(`/tree/index/${commitment}`),

  // ── Notifications / activity ──
  notify: (input: { email: string; type: string; title: string; amount?: string; asset?: string; body?: string }) =>
    request<{ ok: boolean }>('/notifications', { method: 'POST', body: JSON.stringify(input) }),
  listNotifications: (email: string) =>
    request<{ items: NotificationItem[]; unread: number }>(`/notifications?email=${encodeURIComponent(email)}`),
  markNotificationsRead: (email: string) =>
    request<{ ok: boolean }>('/notifications/read', { method: 'POST', body: JSON.stringify({ email }) }),
};

export interface NotificationItem {
  id: string; type: string; title: string; body?: string;
  amount?: string; asset?: string; read: boolean; createdAt: string;
}
