import { useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useTradeStatus } from "../lib/useTradeStatus";
import { useSession } from "../lib/session";

type PayTo = { accountNumber: string; bankName: string; amount: string };

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: "blur(6px)", scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    scale: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as any },
  },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

export default function TradeRoomPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const { trade, error } = useTradeStatus(id ?? null, session.address);
  const payTo = (location.state as { payTo?: PayTo } | null)?.payTo;
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyToClipboard(text: string, fieldName: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  }

  if (!id) {
    return (
      <div className="flex items-center justify-center w-full py-12 relative z-10">
        <motion.div className="max-w-md w-full text-center glass-panel rounded-3xl p-12 shadow-2xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="geist-heading text-2xl mb-4 text-white font-medium">Invalid trade</h1>
          <Link to="/marketplace" className="font-semibold px-6 py-4 rounded-xl inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white">Back to Marketplace</Link>
        </motion.div>
      </div>
    );
  }

  const status = trade?.status ?? "AWAITING_PAYMENT";
  const settled = status === "SETTLED";
  const paid = status === "PAID" || status === "CRYPTO_SENT" || settled;
  const amount = payTo?.amount ?? trade?.expectedAmount ?? "—";
  const bankName = payTo?.bankName ?? "Virtual Account";
  const accountNumber = payTo?.accountNumber ?? trade?.virtualAccountRef ?? "—";

  return (
    <motion.div className="flex flex-col items-center w-full pt-4 sm:pt-6 pb-20 relative z-10" variants={stagger} initial="hidden" animate="visible">
      <div className="w-full max-w-3xl">
        <motion.div variants={fadeUp} className="mb-8">
          <Link to="/marketplace" className="px-5 py-2.5 rounded-full font-mono text-xs border border-white/10 bg-white/5 hover:bg-white/10 transition-all inline-flex items-center gap-2 group text-white/70 hover:text-white">
            <svg className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Marketplace
          </Link>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 sm:mb-10 gap-4">
          <div>
            <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">Escrow Portal</h1>
            <p className="text-white/40 text-sm mt-2 font-light">Pay the Naira; crypto releases automatically once payment is confirmed.</p>
          </div>
          <span className="font-mono text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-lg self-start sm:self-auto font-semibold">TRADE: {id.slice(0, 8)}…</span>
        </motion.div>

        {error && <motion.p variants={fadeUp} className="text-red-400 text-sm mb-6 border border-red-500/25 bg-red-500/[0.02] p-4 rounded-xl">{error}</motion.p>}

        {/* ── Visual Escrow Stepper ── */}
        <motion.div variants={fadeUp} className="w-full mb-8">
          <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-white/5 shadow-xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/35 flex items-center justify-center text-green-400 font-mono text-xs font-bold">✓</div>
                <div>
                  <h4 className="text-white text-sm font-medium">1. ZK Identity Verified</h4>
                  <p className="text-white/40 text-[10px] font-mono mt-0.5">PROOF VERIFIED</p>
                </div>
              </div>
              <div className="hidden md:block flex-1 h-[2px] bg-gradient-to-r from-green-500 to-indigo-500/40 opacity-30 mx-2" />
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold ${paid ? "bg-green-500/10 border border-green-500/35 text-green-400" : "bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 animate-pulse"}`}>{paid ? "✓" : "2"}</div>
                <div>
                  <h4 className="text-white text-sm font-medium">2. Naira Payment</h4>
                  <p className="text-white/40 text-[10px] font-mono mt-0.5 uppercase">{paid ? "Received" : "Awaiting payment"}</p>
                </div>
              </div>
              <div className={`hidden md:block flex-1 h-[2px] mx-2 ${paid ? "bg-gradient-to-r from-green-500 to-indigo-500/40 opacity-30" : "bg-white/5"}`} />
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold ${settled ? "bg-green-500/10 border border-green-500/35 text-green-400" : paid ? "bg-indigo-500/15 border border-indigo-500/35 text-indigo-400 animate-pulse" : "bg-white/5 border border-white/10 text-white/30"}`}>{settled ? "✓" : "3"}</div>
                <div>
                  <h4 className="text-white text-sm font-medium">3. Crypto Released</h4>
                  <p className="text-white/40 text-[10px] font-mono mt-0.5 uppercase">{settled ? "Released" : "Escrow locked"}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Escrow Details Card ── */}
        <motion.div variants={fadeUp} className="glass-panel rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 mb-8 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 via-purple-500 to-green-500" />
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 font-mono text-sm relative z-10">
            <div>
              <dt className="text-white/45 mb-1.5 uppercase tracking-wider text-[10px] font-semibold">Crypto Locked in Escrow</dt>
              <dd className="geist-heading text-3xl font-light text-white">{trade?.cryptoAmount ?? "—"} <span className="text-lg font-semibold text-white/50">{trade?.assetType ?? ""}</span></dd>
            </div>
            <div className="sm:text-right">
              <dt className="text-white/45 mb-1.5 uppercase tracking-wider text-[10px] font-semibold">Fiat Settlement Amount</dt>
              <dd className="geist-heading text-3xl font-light text-emerald-400">₦{amount}</dd>
            </div>
            <div className="sm:col-span-2 pt-5 border-t border-white/5">
              <dt className="text-white/45 mb-2.5 uppercase tracking-wider text-[10px] font-semibold">Status</dt>
              <dd className="text-white text-lg">{status}{settled && " ✅ crypto released to buyer + seller paid"}</dd>
              {trade?.releaseTxHash && <dd className="break-all text-xs font-mono bg-white/[0.02] border border-white/5 p-3 rounded-xl text-white/70 select-all mt-2">release tx: {trade.releaseTxHash}</dd>}
            </div>
          </dl>
        </motion.div>

        {/* ── Send Naira Section (hidden once settled) ── */}
        {!settled && (
          <motion.section variants={fadeUp} className="glass-panel rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 mb-8 shadow-xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </div>
              <h2 className="geist-heading text-xl sm:text-2xl text-white font-medium">Transfer Settlement</h2>
            </div>
            <p className="text-white/60 text-sm mb-6 leading-relaxed font-light">
              Transfer <strong className="text-emerald-400">₦{amount}</strong> to the virtual account below.
              Crypto releases automatically once your payment is confirmed — no further action needed.
            </p>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 sm:p-6 relative overflow-hidden">
              <dl className="space-y-4 font-mono text-sm relative z-10">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 border-b border-white/5 pb-3">
                  <dt className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Receiving Institution</dt>
                  <dd className="text-base text-white">{bankName}</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <dt className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Account Number</dt>
                  <dd className="text-lg text-emerald-400 tracking-widest font-semibold flex items-center gap-2">
                    {accountNumber}
                    <button onClick={() => copyToClipboard(accountNumber, "accountNumber")} className="p-1.5 hover:bg-white/5 rounded transition-colors text-emerald-400/70 hover:text-emerald-300 relative cursor-pointer" title="Copy Account Number">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-5 4h5m-5 4h5m-5 4h3" /></svg>
                      {copiedField === "accountNumber" && <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-[9px] bg-emerald-500 text-white rounded font-sans font-semibold shadow tracking-normal">Copied!</span>}
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
            <p className="text-white/40 text-xs mt-4 font-mono">Polling escrow status every few seconds… ({status})</p>
          </motion.section>
        )}

        {settled && (
          <motion.section variants={fadeUp} className="glass-panel rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-xl border border-green-500/20">
            <p className="text-green-400 text-sm font-semibold mb-4 flex items-center gap-3.5">
              <span className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </span>
              Settlement complete — crypto released to the buyer.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              {trade?.releaseTxHash && (
                <a href={`https://stellar.expert/explorer/testnet/tx/${trade.releaseTxHash}`} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-mono text-xs text-white/80 hover:text-white text-center">Explorer Transaction Details</a>
              )}
              <button onClick={() => navigate("/dashboard")} className="font-mono text-xs text-indigo-400 hover:text-indigo-300 transition-colors text-center py-2">Go to Dashboard →</button>
            </div>
          </motion.section>
        )}
      </div>
    </motion.div>
  );
}
