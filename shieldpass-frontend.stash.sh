#!/usr/bin/env bash
###############################################################################
# ShieldPass Frontend — Scaffold Stash
#
# Builds the full React + Vite + TypeScript + Tailwind frontend file tree for
# ShieldPass, per the tech stack in shieldpass-build-plan.md (section 3 & 9):
#   - React + Vite + TypeScript + Tailwind
#   - Freighter / Stellar Wallets Kit (wallet connector)
#   - bb.js (Barretenberg, in-browser ZK proving via Web Worker)
#   - Stellar SDK (JS) for Horizon/Soroban RPC calls
#   - React Query (server state) + Zustand (proof/payment flow state)
#   - Pages: Landing, Onboarding, Send/Receive Payment, Dashboard
#   - Components: WalletConnectButton, ProofGenerator, PaymentStatusTracker,
#     TransactionExplorerLink
#
# This script is idempotent-ish: it will refuse to overwrite an existing
# target directory so you don't accidentally nuke work in progress.
#
# USAGE:
#   chmod +x shieldpass-frontend.stash.sh
#   ./shieldpass-frontend.stash.sh
#
# Run it from the parent directory you want "shieldpass-frontend/" created in.
###############################################################################

set -euo pipefail

APP_NAME="shieldpass-frontend"

if [ -d "$APP_NAME" ]; then
  echo "❌  Directory '$APP_NAME' already exists. Move/rename it or run this script elsewhere."
  exit 1
fi

echo "🛡️  Scaffolding ShieldPass frontend into ./${APP_NAME} ..."

###############################################################################
# 1. Base Vite + React + TypeScript scaffold
###############################################################################
npm create vite@latest "$APP_NAME" -- --template react-ts

cd "$APP_NAME"

###############################################################################
# 2. Runtime dependencies
#    - Stellar wallet + chain access
#    - ZK proving (bb.js)
#    - server/client state
#    - routing + UI utilities
###############################################################################
npm install \
  @creit.tech/stellar-wallets-kit \
  @stellar/stellar-sdk \
  @aztec/bb.js \
  @tanstack/react-query \
  zustand \
  react-router-dom \
  zod \
  axios \
  clsx

###############################################################################
# 3. Dev dependencies
#    - Tailwind + PostCSS/Autoprefixer for styling
#    - Vite plugin already included by the template, but pin types
###############################################################################
npm install -D \
  tailwindcss \
  postcss \
  autoprefixer \
  @types/node

npx tailwindcss init -p

###############################################################################
# 4. Directory structure
###############################################################################
mkdir -p src/pages
mkdir -p src/components
mkdir -p src/hooks
mkdir -p src/lib/stellar
mkdir -p src/lib/zk
mkdir -p src/store
mkdir -p src/workers
mkdir -p src/types
mkdir -p src/assets
mkdir -p public/circuits
mkdir -p src/styles

###############################################################################
# 5. Tailwind config — wires Tailwind into the src tree
###############################################################################
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

###############################################################################
# 6. Global stylesheet with Tailwind directives
###############################################################################
cat > src/styles/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

###############################################################################
# 7. Environment variable templates (localhost defaults + prod placeholders)
###############################################################################
cat > .env.example << 'EOF'
# Copy to .env.local for local dev, and set equivalents in your hosting
# provider's dashboard (e.g. Vercel project settings) for production.

# Backend API base URL
VITE_API_BASE_URL=http://localhost:4000

# Stellar network: TESTNET for the hackathon build, PUBLIC for mainnet later
VITE_STELLAR_NETWORK=TESTNET

# Horizon + Soroban RPC endpoints (testnet defaults)
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Deployed contract IDs (fill in after `stellar contract deploy`)
VITE_COMPLIANCE_REGISTRY_CONTRACT_ID=
VITE_PAYMENT_GATEWAY_CONTRACT_ID=
EOF

cat > .env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:4000
VITE_STELLAR_NETWORK=TESTNET
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_COMPLIANCE_REGISTRY_CONTRACT_ID=
VITE_PAYMENT_GATEWAY_CONTRACT_ID=
EOF

###############################################################################
# 8. Vite config — dev server on localhost + build settings for prod
###############################################################################
cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    open: true,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext', // bb.js relies on modern WASM/BigInt support
  },
  optimizeDeps: {
    exclude: ['@aztec/bb.js'], // avoid double-bundling the WASM module
  },
  worker: {
    format: 'es',
  },
})
EOF

###############################################################################
# 9. Stellar wallet connector wrapper
###############################################################################
cat > src/lib/stellar/wallet.ts << 'EOF'
import {
  StellarWalletsKit,
  FREIGHTER_ID,
  WalletNetwork,
} from '@creit.tech/stellar-wallets-kit'

const network =
  import.meta.env.VITE_STELLAR_NETWORK === 'PUBLIC'
    ? WalletNetwork.PUBLIC
    : WalletNetwork.TESTNET

export const walletKit = new StellarWalletsKit({
  network,
  selectedWalletId: FREIGHTER_ID,
})

export async function connectWallet() {
  const { address } = await walletKit.getAddress()
  return address
}

export async function signTransactionXdr(unsignedXdr: string) {
  const { signedTxXdr } = await walletKit.signTransaction(unsignedXdr)
  return signedTxXdr
}
EOF

###############################################################################
# 10. Stellar/Horizon/Soroban client wrapper
###############################################################################
cat > src/lib/stellar/client.ts << 'EOF'
import * as StellarSdk from '@stellar/stellar-sdk'

export const horizonServer = new StellarSdk.Horizon.Server(
  import.meta.env.VITE_HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
)

export const sorobanRpc = new StellarSdk.SorobanRpc.Server(
  import.meta.env.VITE_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
)

export const COMPLIANCE_REGISTRY_CONTRACT_ID =
  import.meta.env.VITE_COMPLIANCE_REGISTRY_CONTRACT_ID ?? ''

export const PAYMENT_GATEWAY_CONTRACT_ID =
  import.meta.env.VITE_PAYMENT_GATEWAY_CONTRACT_ID ?? ''

export function explorerLinkForTx(txHash: string) {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`
}
EOF

###############################################################################
# 11. API client (talks to the backend's /auth, /kyc, /compliance, /payments)
###############################################################################
cat > src/lib/api.ts << 'EOF'
import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('shieldpass_jwt')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
EOF

###############################################################################
# 12. ZK proof generation helper (runs inside a Web Worker — see workers/)
###############################################################################
cat > src/lib/zk/proveInBrowser.ts << 'EOF'
// Thin wrapper invoked from inside the Web Worker (see ../../workers/proof.worker.ts).
// Keeps bb.js usage isolated so the main thread never touches private witness data.
import { UltraHonkBackend } from '@aztec/bb.js'

export interface WitnessInputs {
  secret_salt: string
  kyc_passed: string
  sanctions_clear: string
  country_eligible: string
  age_over_18: string
  expiry_timestamp: string
  merkle_path: string[]
  merkle_path_indices: string[]
  merkle_root: string
  current_timestamp: string
  nullifier: string
}

export async function generateProof(
  circuitBytecode: Uint8Array,
  witnessInputs: WitnessInputs
) {
  const backend = new UltraHonkBackend(circuitBytecode)
  const { proof, publicInputs } = await backend.generateProof(witnessInputs as never)
  return { proof, publicInputs }
}
EOF

###############################################################################
# 13. Web Worker — keeps bb.js proving off the main UI thread
###############################################################################
cat > src/workers/proof.worker.ts << 'EOF'
/// <reference lib="webworker" />
import { generateProof, type WitnessInputs } from '../lib/zk/proveInBrowser'

interface ProofRequestMessage {
  type: 'GENERATE_PROOF'
  circuitBytecode: Uint8Array
  witnessInputs: WitnessInputs
}

self.onmessage = async (event: MessageEvent<ProofRequestMessage>) => {
  const { type, circuitBytecode, witnessInputs } = event.data
  if (type !== 'GENERATE_PROOF') return

  try {
    const { proof, publicInputs } = await generateProof(circuitBytecode, witnessInputs)
    self.postMessage({ type: 'PROOF_READY', proof, publicInputs })
  } catch (err) {
    self.postMessage({
      type: 'PROOF_ERROR',
      error: err instanceof Error ? err.message : 'Unknown proving error',
    })
  }
}
EOF

###############################################################################
# 14. Zustand store — in-progress proof/payment flow state
###############################################################################
cat > src/store/useProofFlowStore.ts << 'EOF'
import { create } from 'zustand'

type ProofStage =
  | 'idle'
  | 'generating_proof'
  | 'verifying_on_chain'
  | 'confirmed'
  | 'error'

interface ProofFlowState {
  stage: ProofStage
  proof: unknown | null
  publicInputs: unknown | null
  txHash: string | null
  errorMessage: string | null
  setStage: (stage: ProofStage) => void
  setProofResult: (proof: unknown, publicInputs: unknown) => void
  setTxHash: (txHash: string) => void
  setError: (message: string) => void
  reset: () => void
}

export const useProofFlowStore = create<ProofFlowState>((set) => ({
  stage: 'idle',
  proof: null,
  publicInputs: null,
  txHash: null,
  errorMessage: null,
  setStage: (stage) => set({ stage }),
  setProofResult: (proof, publicInputs) => set({ proof, publicInputs }),
  setTxHash: (txHash) => set({ txHash }),
  setError: (errorMessage) => set({ stage: 'error', errorMessage }),
  reset: () =>
    set({
      stage: 'idle',
      proof: null,
      publicInputs: null,
      txHash: null,
      errorMessage: null,
    }),
}))
EOF

###############################################################################
# 15. React Query client + hooks (server state)
###############################################################################
cat > src/lib/queryClient.ts << 'EOF'
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
EOF

cat > src/hooks/usePaymentStatus.ts << 'EOF'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePaymentStatus(paymentId: string | undefined) {
  return useQuery({
    queryKey: ['payment-status', paymentId],
    queryFn: async () => {
      const { data } = await api.get(`/payments/${paymentId}/status`)
      return data
    },
    enabled: Boolean(paymentId),
    refetchInterval: (query) =>
      query.state.data?.status === 'settled' ? false : 2000,
  })
}
EOF

cat > src/hooks/useComplianceRoot.ts << 'EOF'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useComplianceRoot() {
  return useQuery({
    queryKey: ['compliance-root'],
    queryFn: async () => {
      const { data } = await api.get('/compliance/root')
      return data
    },
  })
}
EOF

###############################################################################
# 16. Components (per build plan section 9)
###############################################################################
cat > src/components/WalletConnectButton.tsx << 'EOF'
import { useState } from 'react'
import { connectWallet } from '../lib/stellar/wallet'

export function WalletConnectButton() {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      const addr = await connectWallet()
      setAddress(addr)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <button
      onClick={handleConnect}
      disabled={connecting}
      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
    >
      {address
        ? `${address.slice(0, 4)}...${address.slice(-4)}`
        : connecting
          ? 'Connecting...'
          : 'Connect Wallet'}
    </button>
  )
}
EOF

cat > src/components/ProofGenerator.tsx << 'EOF'
import { useEffect, useRef, useState } from 'react'
import { useProofFlowStore } from '../store/useProofFlowStore'

// Runs bb.js proving inside a Web Worker so the UI never freezes.
// This never sends secret_salt, flags, or the merkle path to a server.
export function ProofGenerator() {
  const workerRef = useRef<Worker | null>(null)
  const [progressLabel, setProgressLabel] = useState('Idle')
  const { stage, setStage, setProofResult, setError } = useProofFlowStore()

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/proof.worker.ts', import.meta.url),
      { type: 'module' }
    )

    workerRef.current.onmessage = (event) => {
      const { type, proof, publicInputs, error } = event.data
      if (type === 'PROOF_READY') {
        setProofResult(proof, publicInputs)
        setStage('verifying_on_chain')
        setProgressLabel('Verifying on Stellar...')
      } else if (type === 'PROOF_ERROR') {
        setError(error)
      }
    }

    return () => workerRef.current?.terminate()
  }, [setProofResult, setStage, setError])

  function startProving(circuitBytecode: Uint8Array, witnessInputs: unknown) {
    setStage('generating_proof')
    setProgressLabel('Generating zero-knowledge proof locally — this never leaves your device')
    workerRef.current?.postMessage({
      type: 'GENERATE_PROOF',
      circuitBytecode,
      witnessInputs,
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-600">{progressLabel}</p>
      {stage === 'generating_proof' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-100">
          <div className="h-full w-1/3 animate-pulse bg-indigo-500" />
        </div>
      )}
      {/* Expose startProving via props/context in real usage */}
    </div>
  )
}
EOF

cat > src/components/PaymentStatusTracker.tsx << 'EOF'
import { usePaymentStatus } from '../hooks/usePaymentStatus'

interface PaymentStatusTrackerProps {
  paymentId: string
}

export function PaymentStatusTracker({ paymentId }: PaymentStatusTrackerProps) {
  const { data, isLoading } = usePaymentStatus(paymentId)

  if (isLoading) return <p className="text-sm text-gray-500">Checking status...</p>

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium">Status: {data?.status ?? 'unknown'}</p>
      {data?.txHash && (
        <p className="mt-1 truncate text-xs text-gray-500">Tx: {data.txHash}</p>
      )}
    </div>
  )
}
EOF

cat > src/components/TransactionExplorerLink.tsx << 'EOF'
import { explorerLinkForTx } from '../lib/stellar/client'

interface TransactionExplorerLinkProps {
  txHash: string
}

export function TransactionExplorerLink({ txHash }: TransactionExplorerLinkProps) {
  return (
    <a
      href={explorerLinkForTx(txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-indigo-600 underline hover:text-indigo-500"
    >
      View on Stellar Expert →
    </a>
  )
}
EOF

###############################################################################
# 17. Pages (per build plan section 9)
###############################################################################
cat > src/pages/Landing.tsx << 'EOF'
import { Link } from 'react-router-dom'
import { WalletConnectButton } from '../components/WalletConnectButton'

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">ShieldPass</h1>
      <p className="max-w-md text-gray-600">
        Prove you're compliant — KYC'd, not sanctioned, eligible country, 18+ —
        without revealing your identity, documents, or which fact is which.
      </p>
      <WalletConnectButton />
      <Link to="/onboarding" className="text-sm text-indigo-600 underline">
        Get your compliance pass
      </Link>
    </div>
  )
}
EOF

cat > src/pages/Onboarding.tsx << 'EOF'
import { useState } from 'react'
import { api } from '../lib/api'

export function Onboarding() {
  const [submitting, setSubmitting] = useState(false)
  const [issued, setIssued] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const form = new FormData(e.currentTarget)
      await api.post('/kyc/submit', {
        fullName: form.get('fullName'),
        dateOfBirth: form.get('dateOfBirth'),
        countryCode: form.get('countryCode'),
      })
      await api.post('/compliance/issue-attestation')
      setIssued(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (issued) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="text-2xl font-semibold">Your compliance pass is ready</h2>
        <p className="mt-2 text-gray-600">
          Your details were checked once, by our issuer, and never touch the
          blockchain.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4 py-16">
      <h2 className="text-2xl font-semibold">Get Your Pass</h2>
      <input name="fullName" placeholder="Full name" className="w-full rounded-md border px-3 py-2" required />
      <input name="dateOfBirth" type="date" className="w-full rounded-md border px-3 py-2" required />
      <input name="countryCode" placeholder="Country code (e.g. US)" className="w-full rounded-md border px-3 py-2" required />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Generating your compliance pass…' : 'Submit'}
      </button>
    </form>
  )
}
EOF

cat > src/pages/Payment.tsx << 'EOF'
import { useState } from 'react'
import { ProofGenerator } from '../components/ProofGenerator'
import { TransactionExplorerLink } from '../components/TransactionExplorerLink'
import { useProofFlowStore } from '../store/useProofFlowStore'

export function Payment() {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const { stage, txHash } = useProofFlowStore()

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <h2 className="text-2xl font-semibold">Send Payment</h2>
      <input
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Recipient Stellar address"
        className="w-full rounded-md border px-3 py-2"
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (USDC)"
        className="w-full rounded-md border px-3 py-2"
      />
      <ProofGenerator />
      {stage === 'confirmed' && txHash && <TransactionExplorerLink txHash={txHash} />}
    </div>
  )
}
EOF

cat > src/pages/Dashboard.tsx << 'EOF'
import { useComplianceRoot } from '../hooks/useComplianceRoot'

export function Dashboard() {
  const { data } = useComplianceRoot()

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-16">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Current Merkle root version</p>
        <p className="font-mono text-sm">{data?.version ?? '—'}</p>
      </div>
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Pass status</p>
        <p className="font-medium">Active</p>
      </div>
    </div>
  )
}
EOF

###############################################################################
# 18. App shell + router + providers
###############################################################################
cat > src/App.tsx << 'EOF'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { Landing } from './pages/Landing'
import { Onboarding } from './pages/Onboarding'
import { Payment } from './pages/Payment'
import { Dashboard } from './pages/Dashboard'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
EOF

cat > src/main.tsx << 'EOF'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
EOF

###############################################################################
# 19. Vercel deployment config (production hosting target per build plan)
###############################################################################
cat > vercel.json << 'EOF'
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
EOF

###############################################################################
# 20. README with run + deploy instructions baked into the repo itself
###############################################################################
cat > README.md << 'EOF'
# ShieldPass Frontend

React + Vite + TypeScript + Tailwind frontend for ShieldPass — private
compliance proofs for cross-border payments on Stellar.

## Local development

```bash
npm install
npm run dev
```

Visit http://localhost:5173

## Production build

```bash
npm run build
npm run preview   # sanity-check the production build locally on :4173
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Set the `VITE_*` environment variables (see `.env.example`) in your Vercel
project settings before the first production deploy.
EOF

###############################################################################
# 21. .gitignore additions
###############################################################################
cat >> .gitignore << 'EOF'

# ShieldPass-specific
.env.local
.vercel
EOF

echo ""
echo "✅  ShieldPass frontend scaffolded at ./${APP_NAME}"
echo "    Next steps:"
echo "      cd ${APP_NAME}"
echo "      npm run dev"
echo ""
