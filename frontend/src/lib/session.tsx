import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { PasskeyWalletClient } from '@shieldpass/sdk/dist/passkey'

interface SessionState {
  email: string
  name: string
  phone: string
  secretSalt: string | null
  merkleRoot: string | null
  wallet: PasskeyWalletClient | null
  keyId: string
  address: string | null // C-address smart wallet
}

export interface Session extends SessionState {
  onboarded: boolean
  set: (patch: Partial<SessionState>) => void
  reset: () => void
}

const EMPTY: SessionState = {
  email: '', name: '', phone: '',
  secretSalt: null, merkleRoot: null,
  wallet: null, keyId: '', address: null,
}

const STORAGE_KEY = 'shieldpass_session'

// Only serializable fields are persisted; the live `wallet` instance is re-created via
// PasskeyWalletClient.connectWallet(keyId) on reconnect.
type Persisted = Omit<SessionState, 'wallet'>

function loadPersisted(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Persisted
    return { ...EMPTY, ...p, wallet: null }
  } catch {
    return EMPTY
  }
}

function savePersisted(s: SessionState) {
  const { wallet: _wallet, ...rest } = s
  void _wallet
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rest)) } catch { /* ignore quota */ }
}

const SessionCtx = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(loadPersisted)
  const value: Session = {
    ...state,
    onboarded: !!(state.secretSalt && state.address),
    set: (patch) => setState((s) => { const next = { ...s, ...patch }; savePersisted(next); return next }),
    reset: () => { try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } setState(EMPTY) },
  }
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export function useSession(): Session {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
