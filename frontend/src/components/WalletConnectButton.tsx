import { useState } from "react";
import { useSession } from "../lib/session";
import { makeWallet } from "../lib/passkey";
import { api } from "../lib/api";

// Props are accepted for backward-compat with pages not yet migrated (Dashboard/TradeRoom, 3C)
// but are ignored — the wallet now comes from the shared session.
interface WalletConnectButtonProps {
  connectedAddress?: string | null;
  onConnect?: (address: string | null) => void;
}

export default function WalletConnectButton(_props: WalletConnectButtonProps) {
  void _props;
  const session = useSession();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (session.address) { session.reset(); return; }

    if (!session.keyId || !session.email) {
      alert("Finish onboarding first to create your passkey wallet.");
      window.location.href = "/onboarding";
      return;
    }
    setBusy(true);
    try {
      const pin = window.prompt("Enter your PIN to reconnect:") || "";
      const { ok } = await api.verifyPin({ email: session.email, pin });
      if (!ok) { alert("Incorrect PIN."); return; }
      const wallet = await makeWallet();
      // Bind to the persisted contract address when we have one, so reconnect resolves to the
      // exact wallet from the prior session rather than re-deriving it.
      const res = await wallet.connectWallet(session.keyId, session.address ?? undefined);
      session.set({ wallet, address: res.contractId, keyId: res.keyId });
    } catch (err) {
      console.error("Passkey reconnect failed:", err);
      alert("Could not reconnect your passkey wallet.");
    } finally {
      setBusy(false);
    }
  }

  const label = busy
    ? "Connecting…"
    : session.address
      ? `Disconnect: ${session.address.slice(0, 6)}…${session.address.slice(-4)}`
      : "Connect Passkey";

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`outline-btn font-mono text-[10px] sm:text-xs uppercase tracking-widest px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
        session.address ? "opacity-70 hover:opacity-100" : "primary"
      }`}
    >
      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
      {label}
    </button>
  );
}
