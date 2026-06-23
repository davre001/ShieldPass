import type { PasskeyWalletClient } from '@shieldpass/sdk/dist/passkey'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK = 'Test SDF Network ; September 2015'
const WALLET_WASM_HASH = import.meta.env.VITE_WALLET_WASM_HASH || ''

// Dynamic import: the SDK dist files are CommonJS; Vite resolves named exports from them reliably
// via dynamic import (matches how the tester + useZkProof load SDK deep paths).
export async function makeWallet(): Promise<PasskeyWalletClient> {
  const { PasskeyWalletClient } = await import('@shieldpass/sdk/dist/passkey')
  return new PasskeyWalletClient({ rpcUrl: RPC_URL, networkPassphrase: NETWORK, walletWasmHash: WALLET_WASM_HASH })
}

/** Submit a passkey-signed XDR through the backend Channels relay. */
export async function submitSigned(signedXdr: string): Promise<string> {
  const res = await fetch(`${API_URL}/wallet/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signedXdr }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'submit failed')
  return data.hash
}
