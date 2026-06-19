import type { ComplianceAttestation, P2POffer, TradeHistoryItem, BankDetails } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `API error: ${res.status}`);
  }
  return res.json();
}

// 1. Onboarding & KYC Endpoints
export async function submitBvn(bvn: string): Promise<{ accepted: boolean }> {
  return request<{ accepted: boolean }>('/kyc/submit-bvn', {
    method: 'POST',
    body: JSON.stringify({ bvn }),
  });
}

export async function issueAttestation(): Promise<ComplianceAttestation> {
  return request<ComplianceAttestation>('/compliance/issue-attestation', {
    method: 'POST',
  });
}

// 2. ZK Relayer Endpoints
export async function submitProof(proof: string): Promise<{ verified: boolean; nullifier: string }> {
  return request<{ verified: boolean; nullifier: string }>('/verify/submit-proof', {
    method: 'POST',
    body: JSON.stringify({ proof }),
  });
}

// 3. P2P Core Orderbook Endpoints
export async function listOffers(): Promise<P2POffer[]> {
  return request<P2POffer[]>('/p2p/offers');
}

export async function acceptOffer(offerId: string, nullifier: string): Promise<{ bankDetails: BankDetails }> {
  return request<{ bankDetails: BankDetails }>(`/p2p/offers/${offerId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ nullifier }),
  });
}

export async function markPaymentSent(offerId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/p2p/offers/${offerId}/pay`, {
    method: 'POST',
  });
}

export async function getTradeHistory(walletAddress: string): Promise<TradeHistoryItem[]> {
  return request<TradeHistoryItem[]>(`/p2p/history?address=${walletAddress}`);
}