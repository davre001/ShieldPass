import { useSession } from "../lib/session";

/**
 * Displays the user's PRIVATE shielded note balance (session.note). This value is
 * not on-chain wallet money — it's a confidential claim in the pool, spendable for
 * off-ramps. Amount + asset are read from the note, never hardcoded, so changing
 * the faucet seed (backend FAUCET_NOTE_AMOUNT/ASSET) flows through automatically.
 */
export default function ShieldedBalance({ compact = false }: { compact?: boolean }) {
  const { notes } = useSession();
  // Single-asset pool: total = sum of note amounts; asset label from the notes.
  const total = notes.reduce((acc, n) => acc + BigInt(n.amount), 0n);
  const asset = notes[0]?.asset ?? "XLM";
  const hasBalance = notes.length > 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.07] to-white/[0.01] p-5">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-white/40 text-xs font-mono tracking-wider uppercase">Shielded Balance</span>
        </div>

        {hasBalance ? (
          <>
            <div className="text-white font-medium text-3xl tracking-tight">
              {total.toString()} <span className="text-white/50 text-xl">{asset}</span>
            </div>
            {!compact && (
              <p className="text-white/35 text-xs mt-2 leading-relaxed">
                Private · off-chain · spendable for off-ramps. Across {notes.length} note{notes.length === 1 ? "" : "s"}. Your wallet shows 0 by design — this balance lives as zero-knowledge notes, not on the ledger.
              </p>
            )}
          </>
        ) : (
          <div className="text-white/30 text-sm">No shielded balance yet — onboard or shield funds to add some.</div>
        )}
      </div>
    </div>
  );
}
