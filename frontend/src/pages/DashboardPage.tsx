import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import ErrorNotice from "../components/ErrorNotice";
import type { Balance, SwapRecord } from "../types";

const RPC_URL = "https://soroban-testnet.stellar.org";
const TOKENS = [
  { code: "XLM", sac: import.meta.env.VITE_XLM_SAC as string | undefined },
  { code: "USDC", sac: import.meta.env.VITE_USDC_SAC as string | undefined },
  { code: "NGNC", sac: import.meta.env.VITE_NGNC_SAC as string | undefined },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: "blur(6px)", scale: 0.98 },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", scale: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as any } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.15 } } };

const getAssetTheme = (assetCode: string) => {
  const code = assetCode.toUpperCase();
  if (code.includes("USD")) return { bg: "bg-cyan-500/10 border-cyan-500/25", glow: "bg-cyan-500/10", text: "text-cyan-400" };
  if (code.includes("NGN")) return { bg: "bg-emerald-500/10 border-emerald-500/25", glow: "bg-emerald-500/10", text: "text-emerald-400" };
  return { bg: "bg-indigo-500/10 border-indigo-500/25", glow: "bg-indigo-500/10", text: "text-indigo-400" };
};

export default function DashboardPage() {
  const session = useSession();
  const address = session.address;
  const email = session.email;

  const [balances, setBalances] = useState<Balance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<unknown>(null);

  const [history, setHistory] = useState<SwapRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<unknown>(null);

  useEffect(() => {
    if (!address) return;

    setBalancesLoading(true);
    setBalancesError(null);
    (async () => {
      try {
        const { StellarContractClient } = await import("@shieldpass/sdk/dist/stellar");
        const { Networks } = await import("@stellar/stellar-sdk");
        const configured = TOKENS.filter((t) => !!t.sac);
        const out: Balance[] = [];
        for (const t of configured) {
          const client = new StellarContractClient(RPC_URL, Networks.TESTNET, t.sac as string);
          const raw = await client.getTokenBalance(t.sac as string, address);
          out.push({ assetCode: t.code, balance: (Number(raw) / 1e7).toFixed(2) });
        }
        setBalances(out);
      } catch (err) {
        setBalancesError(err);
      } finally {
        setBalancesLoading(false);
      }
    })();
  }, [address]);

  useEffect(() => {
    if (!email) return;
    setHistoryLoading(true);
    setHistoryError(null);
    api.swapHistory(email)
      .then(setHistory)
      .catch((err) => setHistoryError(err))
      .finally(() => setHistoryLoading(false));
  }, [email]);

  return (
    <motion.div className="flex flex-col items-center w-full pt-4 sm:pt-6 pb-20 relative z-10" variants={stagger} initial="hidden" animate="visible">
      <div className="w-full max-w-4xl">
        <motion.div variants={fadeUp} className="flex flex-col md:flex-row md:items-baseline justify-between mb-8 sm:mb-10 gap-4">
          <div>
            <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">Portfolio Dashboard</h1>
            <p className="text-white/40 text-sm mt-2 font-light">Your smart-wallet balances and zero-knowledge swap history.</p>
          </div>
          <Link to="/swap" className="px-5 py-2.5 rounded-full font-mono text-xs border border-white/10 bg-white/5 hover:bg-white/10 transition-all flex items-center gap-2 group self-start md:self-auto">
            Swap Crypto
            <svg className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
        </motion.div>

        <motion.div variants={fadeUp} className="mb-12">
          <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 border border-white/5 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <div>
                <h3 className="font-medium text-white">Passkey Smart Wallet</h3>
                <p className="text-white/40 text-xs mt-0.5 font-mono">{address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "Not connected"}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {!address && (
          <motion.div variants={fadeUp} className="glass-panel rounded-[2rem] p-12 text-center border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/5 rounded-full blur-[80px]" />
            <p className="text-white/60 text-sm max-w-sm mx-auto leading-relaxed">Onboard to pull live on-chain balances and your swap history.</p>
            <Link to="/onboarding" className="mt-6 inline-block font-mono text-xs px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors">Start Onboarding</Link>
          </motion.div>
        )}

        {address && (
          <div className="space-y-12">
            <motion.section variants={fadeUp}>
              <h2 className="geist-heading text-xl sm:text-2xl mb-4 sm:mb-6 flex items-center gap-3 text-white font-medium">
                <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                On-Chain Vault Balances
              </h2>
              {balancesLoading && <div className="flex items-center gap-3 opacity-60 text-sm border border-white/5 bg-white/[0.01] p-6 rounded-2xl">Reading token contracts…</div>}
              {balancesError ? <ErrorNotice error={balancesError} className="border border-red-500/20 bg-red-500/[0.02] p-6 rounded-2xl" /> : null}
              {!balancesLoading && !balancesError && (
                <div className="grid sm:grid-cols-2 gap-5">
                  {balances.length === 0 ? (
                    <div className="glass-panel rounded-2xl p-8 text-center col-span-2"><p className="text-white/50 text-sm">No token balances configured. Set VITE_XLM_SAC / VITE_USDC_SAC / VITE_NGNC_SAC.</p></div>
                  ) : (
                    balances.map((b) => {
                      const theme = getAssetTheme(b.assetCode);
                      return (
                        <motion.div key={b.assetCode} variants={fadeUp} whileHover={{ y: -3, scale: 1.01 }} className={`glass-panel rounded-2xl p-6 sm:p-8 border ${theme.bg} relative overflow-hidden shadow-lg`}>
                          <div className={`absolute top-0 right-0 w-36 h-36 ${theme.glow} rounded-full blur-[40px] pointer-events-none -mr-10 -mt-10`} />
                          <p className="font-mono text-xs text-white/40 mb-3 uppercase tracking-widest font-semibold">{b.assetCode} Vault</p>
                          <p className="geist-heading text-3xl sm:text-4xl font-light text-white">{parseFloat(b.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
                          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">SAC Balance</span>
                            <span className={`w-2 h-2 rounded-full ${theme.text} bg-current animate-pulse`} />
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              )}
            </motion.section>

            <motion.section variants={fadeUp}>
              <h2 className="geist-heading text-xl sm:text-2xl mb-4 sm:mb-6 flex items-center gap-3 text-white font-medium">
                <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                Swap History
              </h2>
              {historyLoading && <div className="flex items-center gap-3 opacity-60 text-sm border border-white/5 bg-white/[0.01] p-6 rounded-2xl">Loading swap history…</div>}
              {historyError ? <ErrorNotice error={historyError} className="border border-red-500/20 bg-red-500/[0.02] p-6 rounded-2xl" /> : null}
              {!historyLoading && !historyError && history.length === 0 && (
                <div className="glass-panel rounded-2xl p-10 text-center border border-white/5 shadow-md"><p className="text-white/50 text-sm">No swaps yet. Your settlements will appear here.</p></div>
              )}
              {!historyLoading && !historyError && history.length > 0 && (
                <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-white/5 border border-white/5 shadow-xl">
                  {history.map((t, i) => (
                    <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 hover:bg-white/[0.02] transition-colors gap-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-baseline gap-2 sm:gap-6 w-full">
                        <span className={`font-mono text-[10px] uppercase tracking-widest w-16 text-xs text-indigo-400`}>SELL</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="geist-heading text-xl font-light text-white">{t.cryptoAmount}</span>
                          <span className="text-xs font-semibold text-white/50">CRYPTO</span>
                        </div>
                        <span className="font-mono text-sm text-white/60">₦{t.nairaAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className={`font-mono text-[10px] px-3.5 py-1.5 rounded-full border flex items-center gap-2 ${t.status.toUpperCase() === "COMPLETED" || t.status.toUpperCase() === "SUCCESS" ? "text-green-400 border-green-400/20 bg-green-400/5 font-semibold" : "text-white/50 border-white/10 bg-white/5"}`}>
                          {(t.status.toUpperCase() === "COMPLETED" || t.status.toUpperCase() === "SUCCESS") && (
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
                          )}
                          {t.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.section>
          </div>
        )}
      </div>
    </motion.div>
  );
}
