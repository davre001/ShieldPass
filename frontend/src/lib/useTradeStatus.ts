import { useEffect, useState } from 'react'
import { api } from './api'
import type { Trade } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const TERMINAL = ['SETTLED', 'CANCELLED', 'DISPUTED']

/** Live trade state via SSE. Initial paint uses getTrade; updates arrive over /p2p/trades/live. */
export function useTradeStatus(tradeId: string | null, wallet: string | null) {
  const [trade, setTrade] = useState<Trade | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tradeId) return
    let closed = false
    let es: EventSource | null = null

    api.getTrade(tradeId).then((t) => { if (!closed) setTrade(t) }).catch((e) => { if (!closed) setError(e.message) })

    if (wallet) {
      es = new EventSource(`${API_URL}/p2p/trades/live?wallet=${encodeURIComponent(wallet)}`)
      es.onmessage = (ev) => {
        try {
          const t = JSON.parse(ev.data) as Trade
          if (t.id === tradeId) {
            setTrade(t)
            if (TERMINAL.includes(t.status)) { es?.close() }
          }
        } catch { /* ignore heartbeats / parse noise */ }
      }
      es.onerror = () => { /* browser auto-reconnects; nothing to do */ }
    }

    return () => { closed = true; es?.close() }
  }, [tradeId, wallet])

  return { trade, error }
}
