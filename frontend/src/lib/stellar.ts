import type { Balance } from '../types';

const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';

/**
 * Reads live asset credit configurations directly from the Horizon Network Ledger
 */
export async function getAccountBalances(walletAddress: string): Promise<Balance[]> {
  try {
    const res = await fetch(`${HORIZON_TESTNET_URL}/accounts/${walletAddress}`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Account not funded on Testnet yet. Fund it via Friendbot.');
      }
      throw new Error(`Horizon network response error: ${res.status}`);
    }
    const data = await res.json();
    
    return data.balances.map((b: any) => ({
      assetCode: b.asset_type === 'native' ? 'XLM' : b.asset_code,
      balance: parseFloat(b.balance).toFixed(2),
    }));
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Horizon connection fault.');
  }
}

/**
 * Invokes Soroban Smart Contract compilation parameters to unlock and release assets out of escrow
 */
export async function releaseCrypto(offerId: string, sellerAddress: string): Promise<{ hash: string }> {
  console.log(`Building Soroban invocation context for release_crypto on Offer #${offerId} signed by ${sellerAddress}`);
  
  // Simulate transactional processing time on-chain
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // Return simulated hash tracking record matching TradeRoom specifications
  return {
    hash: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
  };
}