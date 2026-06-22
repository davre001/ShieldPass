/**
 * Swap quoting — converts ANY Stellar asset amount into its live Naira (NGN) payout value.
 *
 * In production this queries a Stellar DEX/AMM (Soroswap/Aqua path payment) for the real-time
 * NGN-equivalent given on-chain liquidity. For the hackathon it uses a configurable rate table so
 * the full off-ramp flow is demoable. Configure with SWAP_RATES:
 *   SWAP_RATES="<tokenAddress>:USDC:1650,<tokenAddress>:XLM:150"
 */

const DEFAULT_RATE = Number(process.env.SWAP_DEFAULT_RATE || 1650); // NGN per unit fallback

interface RateEntry { label: string; rate: number }

function parseRates(raw: string | undefined): Map<string, RateEntry> {
  const map = new Map<string, RateEntry>();
  if (!raw) return map;
  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [addr, label, rate] = part.split(':').map((s) => s.trim());
    if (addr && rate) map.set(addr, { label: label || 'TOKEN', rate: Number(rate) });
  }
  return map;
}

const RATES = parseRates(process.env.SWAP_RATES);

// Friendly labels for well-known assets when a rate isn't explicitly configured.
const FALLBACK_LABELS: Record<string, number> = {
  USDC: 1650,
  XLM: 150,
  NGNC: 1,
  AQUA: 5,
};

export interface Quote {
  tokenAddress: string;
  tokenLabel: string;
  cryptoAmount: number;
  rate: number;       // NGN per crypto unit
  nairaAmount: number;
}

/**
 * Returns the Naira value of `cryptoAmount` of the asset at `tokenAddress`.
 * `assetCode` (e.g. "USDC") is an optional hint used for labelling / fallback pricing.
 */
export function getQuote(tokenAddress: string, cryptoAmount: number, assetCode?: string): Quote {
  let entry = RATES.get(tokenAddress);
  if (!entry && assetCode && FALLBACK_LABELS[assetCode.toUpperCase()] !== undefined) {
    entry = { label: assetCode.toUpperCase(), rate: FALLBACK_LABELS[assetCode.toUpperCase()] };
  }
  const rate = entry?.rate ?? DEFAULT_RATE;
  const tokenLabel = entry?.label ?? (assetCode?.toUpperCase() || 'TOKEN');
  const nairaAmount = Math.round(cryptoAmount * rate * 100) / 100;
  return { tokenAddress, tokenLabel, cryptoAmount, rate, nairaAmount };
}

/** Swaps whose Naira value exceeds this require a Tier 2 (BVN) proof. */
export const TIER2_THRESHOLD_NAIRA = Number(process.env.TIER2_THRESHOLD_NAIRA || 1_000_000);
