import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { SmartAccountWalletClient } from '@shieldpass/sdk/dist/smartAccount'
import type { ShieldedIdentity } from '@shieldpass/sdk'

/** A shielded note the user owns (owner-based model; spent with the user's shielded key). */
export interface ShieldedNote {
  amount: string
  asset: string
  randomness: string   // per-note uniqueness; needed (with the shielded key) to spend
  leafIndex: number
  compliance: { hardware_attested: string; bvn_verified: string; good_standing: string }
}

interface SessionState {
  email: string
  name: string
  phone: string
  secretSalt: string | null
  merkleRoot: string | null
  wallet: SmartAccountWalletClient | null
  identity: ShieldedIdentity | null // shielded keys (in-memory; re-derived from passkey PRF)
  shieldedAddress: string | null    // public "shp_…" address (persisted, shareable)
  credentialId: string
  address: string | null // C-address smart wallet
  bvnVerified: boolean
  notes: ShieldedNote[] // shielded balance = sum of these notes (faucet seed + deposits + change)
}

export interface Session extends SessionState {
  onboarded: boolean
  set: (patch: Partial<SessionState>) => void
  addNote: (note: ShieldedNote) => boolean // functional append; dedupes by randomness; returns true if added
  reset: () => void
}

const EMPTY: SessionState = {
  email: '', name: '', phone: '',
  secretSalt: null, merkleRoot: null,
  wallet: null, identity: null, shieldedAddress: null,
  credentialId: '', address: null,
  bvnVerified: false, notes: [],
}

const STORAGE_KEY = 'shieldpass_session'

// `wallet` and `identity` are live/secret objects — never persisted. The wallet is
// re-created via connectWallet(credentialId); the identity is re-derived from the passkey PRF.
type Persisted = Omit<SessionState, 'wallet' | 'identity'>

function loadPersisted(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Persisted
    return { ...EMPTY, ...p, wallet: null, identity: null }
  } catch {
    return EMPTY
  }
}

function savePersisted(s: SessionState) {
  const { wallet: _wallet, identity: _identity, ...rest } = s
  void _wallet; void _identity
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rest)) } catch { /* ignore quota */ }
}

const SessionCtx = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(loadPersisted)

  // Re-hydrate + reconnect the wallet on page reload if a credentialId exists. Binding the kit to
  // the stored credential/contract is silent (no WebAuthn prompt) — the prompt happens at signing.
  useEffect(() => {
    if (state.credentialId && !state.wallet) {
      import('./smartAccount').then(({ makeWallet }) => {
        makeWallet().then(async w => {
          try { await w.connectWallet(state.credentialId, state.address ?? undefined) }
          catch (e) { console.error('[session] reconnect failed:', e) }
          setState(s => { const next = { ...s, wallet: w }; savePersisted(next); return next; })
        }).catch(console.error)
      }).catch(console.error)
    }
  }, [state.credentialId, state.wallet, state.address])

  const value: Session = {
    ...state,
    onboarded: !!(state.secretSalt && state.address),
    set: (patch) => setState((s) => { const next = { ...s, ...patch }; savePersisted(next); return next }),
    addNote: (note) => {
      let added = false
      setState((s) => {
        if (s.notes.some((n) => n.randomness === note.randomness)) return s
        added = true
        const next = { ...s, notes: [...s.notes, note] }
        savePersisted(next)
        return next
      })
      return added
    },
    reset: () => { try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } setState(EMPTY) },
  }
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export function useSession(): Session {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
