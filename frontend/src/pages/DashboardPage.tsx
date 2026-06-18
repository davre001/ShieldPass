import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTradeHistory } from "../lib/api";
import { getAccountBalances } from "../lib/stellar";
import WalletConnectButton from "../components/WalletConnectButton";
import type { Balance, TradeHistoryItem } from "../types";

// Dashboard — Implementation.md section 9.5.
// Balances come straight from Horizon for the connected wallet; trade
// history comes from the backend's P2POffer records. Nothing here is
// mocked — both reads hit the real Stellar testnet and the real database.

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const [balances, setBalances] = useState<Balance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const [history, setHistory] = useState<TradeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;

    setBalancesLoading(true);
    setBalancesError(null);
    getAccountBalances(walletAddress)
      .then(setBalances)
      .catch((err) =>
        setBalancesError(
          err instanceof Error ? err.message : "Failed to load balances",
        ),
      )
      .finally(() => setBalancesLoading(false));

    setHistoryLoading(true);
    setHistoryError(null);
    getTradeHistory(walletAddress)
      .then(setHistory)
      .catch((err) =>
        setHistoryError(
          err instanceof Error ? err.message : "Failed to load trade history",
        ),
      )
      .finally(() => setHistoryLoading(false));
  }, [walletAddress]);

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--paper)] px-6 md:px-12 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="font-display text-3xl">Dashboard</h1>
          <Link
            to="/marketplace"
            className="font-mono text-xs text-[var(--stone)] hover:text-[var(--paper)] transition-colors"
          >
            Marketplace →
          </Link>
        </div>

        <div className="mb-10">
          <WalletConnectButton
            connectedAddress={walletAddress}
            onConnect={setWalletAddress}
          />
        </div>

        {!walletAddress && (
          <p className="text-[var(--stone)] text-sm">
            Connect a wallet to see balances and trade history.
          </p>
        )}

        {walletAddress && (
          <>
            <section className="mb-10">
              <h2 className="font-display text-xl mb-4">Balances</h2>

              {balancesLoading && (
                <p className="text-[var(--stone)] text-sm">Loading balances…</p>
              )}
              {balancesError && (
                <p className="text-[var(--rust)] text-sm">{balancesError}</p>
              )}

              {!balancesLoading && !balancesError && (
                <div className="grid sm:grid-cols-2 gap-px bg-[var(--hairline)] border border-[var(--hairline)]">
                  {balances.length === 0 ? (
                    <div className="bg-[var(--ink)] p-6">
                      <p className="text-[var(--stone)] text-sm">
                        No balances on this account yet.
                      </p>
                    </div>
                  ) : (
                    balances.map((b) => (
                      <div key={b.assetCode} className="bg-[var(--ink)] p-6">
                        <p className="font-mono text-xs text-[var(--stone)] mb-2">
                          {b.assetCode}
                        </p>
                        <p className="font-mono text-2xl">{b.balance}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-display text-xl mb-4">Trade history</h2>

              {historyLoading && (
                <p className="text-[var(--stone)] text-sm">Loading trades…</p>
              )}
              {historyError && (
                <p className="text-[var(--rust)] text-sm">{historyError}</p>
              )}

              {!historyLoading && !historyError && history.length === 0 && (
                <p className="text-[var(--stone)] text-sm">
                  No trades yet — offers you accept or fill will show up here.
                </p>
              )}

              {!historyLoading && !historyError && history.length > 0 && (
                <div className="border border-[var(--hairline)] rounded-sm divide-y divide-[var(--hairline)]">
                  {history.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between px-6 py-5"
                    >
                      <div className="flex items-baseline gap-6">
                        <span className="font-mono text-xs uppercase tracking-widest text-[var(--stone)] w-14">
                          {trade.role}
                        </span>
                        <span className="font-mono text-sm">
                          {trade.cryptoAmount} {trade.assetType}
                        </span>
                        <span className="text-[var(--stone)] text-sm">
                          ₦{trade.nairaAmount}
                        </span>
                      </div>
                      <span
                        className={`font-mono text-xs ${
                          trade.status === "completed"
                            ? "text-[var(--verified)]"
                            : "text-[var(--stone)]"
                        }`}
                      >
                        {trade.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
