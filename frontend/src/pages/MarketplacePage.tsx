import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import type { Trade } from "../types";
import { useSession } from "../lib/session";
import { useZkProof } from "../lib/useZkProof";
import { submitSigned } from "../lib/passkey";
import ErrorNotice from "../components/ErrorNotice";

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
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

// Assets we can actually escrow on-chain = those with a Stellar Asset Contract (SAC) configured.
// NGNC has no public testnet issuer, so it's only offered if its SAC env is set.
const SUPPORTED_ASSETS = [
  { code: "XLM", label: "XLM — Stellar Lumens", sac: import.meta.env.VITE_XLM_SAC as string | undefined },
  { code: "USDC", label: "USDC — USD Coin", sac: import.meta.env.VITE_USDC_SAC as string | undefined },
  { code: "NGNC", label: "NGNC — Naira Coin", sac: import.meta.env.VITE_NGNC_SAC as string | undefined },
].filter((a): a is { code: string; label: string; sac: string } => !!a.sac);

// Common Nigerian banks + their NIBSS codes (the code is what payout processors route on).
const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "050", name: "Ecobank" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank" },
  { code: "214", name: "FCMB" },
  { code: "058", name: "GTBank" },
  { code: "082", name: "Keystone Bank" },
  { code: "50211", name: "Kuda" },
  { code: "50515", name: "Moniepoint" },
  { code: "999992", name: "OPay" },
  { code: "999991", name: "PalmPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "221", name: "Stanbic IBTC" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank" },
  { code: "033", name: "UBA" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

export default function MarketplacePage() {
  const navigate = useNavigate();
  const session = useSession();
  const zk = useZkProof();

  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  // Sell form
  const [assetType, setAssetType] = useState(SUPPORTED_ASSETS[0]?.code ?? "");
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [nairaRate, setNairaRate] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [selling, setSelling] = useState(false);
  const [sellResult, setSellResult] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Field-level validation. Returns a message per invalid field (absent = valid).
  const errors: Record<string, string> = {};
  if (!SUPPORTED_ASSETS.some((a) => a.code === assetType)) errors.assetType = "Pick an asset to sell.";
  if (!(Number(cryptoAmount) > 0)) errors.cryptoAmount = "Enter an amount greater than 0.";
  if (!(Number(nairaRate) > 0)) errors.nairaRate = "Enter a rate greater than 0.";
  if (!bankCode) errors.bankCode = "Select your bank.";
  if (!/^\d{10}$/.test(accountNumber)) errors.accountNumber = "Account number must be 10 digits.";
  if (accountName.trim().length < 2) errors.accountName = "Enter the account holder's name.";
  const formValid = Object.keys(errors).length === 0;
  const show = (field: string) => (touched[field] || triedSubmit) && errors[field];
  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const proving = zk.status === "loading-circuit" || zk.status === "generating";

  function loadTrades() {
    setLoading(true);
    api
      .listTrades()
      .then((data) => setTrades(data.filter((t) => t.status === "OPEN")))
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    loadTrades();
  }, []);

  async function handleAccept(trade: Trade) {
    setActionError(null);
    if (!session.onboarded || !session.address) {
      setActionError("Complete onboarding first.");
      return;
    }
    if (!session.secretSalt || !session.merkleRoot) {
      setActionError("Missing attestation — re-onboard.");
      return;
    }
    try {
      setBusyId(trade.id);
      const pr = await zk.generateProof(session.secretSalt, session.merkleRoot);
      if (!pr) throw new Error(zk.error || "Proof generation failed.");
      const r = await api.acceptTrade(trade.id, {
        buyerWallet: session.address,
        buyerEmail: session.email,
        proof: pr.proof,
        publicInputs: pr.publicInputs,
        nullifier: pr.nullifier,
      });
      navigate(`/trade/${trade.id}`, { state: { payTo: r.payTo, message: r.message } });
    } catch (err) {
      setActionError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate() {
    setActionError(null);
    setSellResult(null);
    setTriedSubmit(true);
    if (!formValid) {
      setActionError("Fix the highlighted fields before listing.");
      return;
    }
    if (!session.onboarded || !session.address || !session.wallet) {
      setActionError("Complete onboarding + connect your passkey first.");
      return;
    }
    if (!session.secretSalt || !session.merkleRoot) {
      setActionError("Missing attestation — re-onboard.");
      return;
    }
    const escrowId = import.meta.env.VITE_ESCROW_CONTRACT_ID as string;
    // Use the selected asset's SAC as the escrowed token; fall back to the default token id.
    const tokenId =
      SUPPORTED_ASSETS.find((a) => a.code === assetType)?.sac ??
      (import.meta.env.VITE_TOKEN_CONTRACT_ID as string);
    if (!escrowId || !tokenId) {
      setActionError("Missing VITE_ESCROW_CONTRACT_ID / token SAC for this asset.");
      return;
    }
    // Pack the validated parts into the stored payout string: bankCode:accountNumber:accountName
    const bank = `${bankCode}:${accountNumber}:${accountName.trim()}`;
    try {
      setSelling(true);
      const pr = await zk.generateProof(session.secretSalt, session.merkleRoot);
      if (!pr) throw new Error(zk.error || "Proof generation failed.");
      const { StellarContractClient } = await import("@shieldpass/sdk/dist/stellar");
      const { Networks } = await import("@stellar/stellar-sdk");
      const wallet = session.wallet;
      const keyId = session.keyId;
      const stellar = new StellarContractClient("https://soroban-testnet.stellar.org", Networks.TESTNET, escrowId);
      const created = await stellar.createOffer(
        { sellerWallet: session.address, tokenAddress: tokenId, amount: BigInt(cryptoAmount), nullifier: pr.nullifier },
        { kind: "passkey", sign: (xdr: string) => wallet.sign(xdr, keyId), submit: submitSigned },
      );
      const escrowOfferId = String(created.offerId);
      await api.createTrade({
        sellerWallet: session.address,
        assetType,
        cryptoAmount,
        nairaRate,
        sellerBankAccount: bank,
        escrowOfferId,
        proof: pr.proof,
        publicInputs: pr.publicInputs,
        nullifier: pr.nullifier,
      });
      setSellResult("Offer listed on-chain and in the marketplace.");
      setMode("buy");
      loadTrades();
    } catch (err) {
      setActionError(err);
    } finally {
      setSelling(false);
    }
  }

  return (
    <motion.div
      className="flex flex-col items-center w-full pt-4 sm:pt-6 pb-20 relative z-10"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      <div className="w-full max-w-4xl">
        <motion.div
          variants={fadeUp}
          className="flex flex-col md:flex-row md:items-baseline justify-between mb-8 gap-4"
        >
          <div>
            <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">
              Marketplace
            </h1>
            <p className="text-white/40 text-sm mt-2 font-light">
              Trade crypto for naira privately — every action gated by a real ZK proof.
            </p>
          </div>
          <p className="font-mono text-xs opacity-60 bg-white/[0.08] border border-white/10 px-4 py-2 rounded-full self-start md:self-auto">
            {trades.length} OPEN OFFERS
          </p>
        </motion.div>

        {/* Buy / Sell toggle */}
        <motion.div variants={fadeUp} className="flex gap-2 mb-8">
          <button
            onClick={() => setMode("buy")}
            className={`font-mono text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg border border-white/10 transition-all ${mode === "buy" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "bg-white/5 text-white/50"}`}
          >
            Buy
          </button>
          <button
            onClick={() => setMode("sell")}
            className={`font-mono text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg border border-white/10 transition-all ${mode === "sell" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "bg-white/5 text-white/50"}`}
          >
            Sell
          </button>
        </motion.div>

        {actionError ? (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="border border-red-500/20 bg-red-500/[0.02] p-4 rounded-2xl mb-6 flex items-center justify-between gap-4">
            <ErrorNotice error={actionError} className="min-w-0" />
            {!session.onboarded && (
              <button onClick={() => navigate("/onboarding")} className="text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all font-mono">
                Go to Onboarding
              </button>
            )}
          </motion.div>
        ) : null}

        {/* ── SELL: create offer ── */}
        {mode === "sell" && (
          <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-6 mb-8 space-y-5 max-w-lg">
            {/* Crypto you're selling */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50 font-medium">Asset</span>
                <select
                  className="font-mono bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400/50 appearance-none"
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  onBlur={() => markTouched("assetType")}
                >
                  {SUPPORTED_ASSETS.length === 0 && <option value="">No assets configured</option>}
                  {SUPPORTED_ASSETS.map((a) => (
                    <option key={a.code} value={a.code} className="bg-zinc-900">{a.label}</option>
                  ))}
                </select>
                <span className="text-[11px] text-white/35">The crypto you'll lock in escrow.</span>
                {show("assetType") && <span className="text-[11px] text-red-400">{errors.assetType}</span>}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50 font-medium">Amount</span>
                <input
                  type="number" min="0" inputMode="decimal"
                  className="font-mono bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400/50"
                  value={cryptoAmount}
                  onChange={(e) => setCryptoAmount(e.target.value)}
                  onBlur={() => markTouched("cryptoAmount")}
                  placeholder="100"
                />
                <span className="text-[11px] text-white/35">How much {assetType || "crypto"} to sell.</span>
                {show("cryptoAmount") && <span className="text-[11px] text-red-400">{errors.cryptoAmount}</span>}
              </label>
            </div>

            {/* Price */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50 font-medium">Rate (₦ per {assetType || "unit"})</span>
              <input
                type="number" min="0" inputMode="decimal"
                className="font-mono bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400/50"
                value={nairaRate}
                onChange={(e) => setNairaRate(e.target.value)}
                onBlur={() => markTouched("nairaRate")}
                placeholder="1650"
              />
              <span className="text-[11px] text-white/35">Naira the buyer pays per 1 {assetType || "unit"}.</span>
              {show("nairaRate") && <span className="text-[11px] text-red-400">{errors.nairaRate}</span>}
            </label>

            {/* Payout destination */}
            <div className="space-y-3 pt-1 border-t border-white/5">
              <p className="text-xs text-white/50 font-medium pt-3">Your bank account (where the buyer sends Naira)</p>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-white/35">Bank</span>
                <select
                  className="font-mono bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400/50 appearance-none"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  onBlur={() => markTouched("bankCode")}
                >
                  <option value="" className="bg-zinc-900">Select your bank…</option>
                  {NIGERIAN_BANKS.map((b) => (
                    <option key={b.code} value={b.code} className="bg-zinc-900">{b.name}</option>
                  ))}
                </select>
                {show("bankCode") && <span className="text-[11px] text-red-400">{errors.bankCode}</span>}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-white/35">Account number</span>
                  <input
                    inputMode="numeric" maxLength={10}
                    className="font-mono bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400/50"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    onBlur={() => markTouched("accountNumber")}
                    placeholder="0123456789"
                  />
                  {show("accountNumber") && <span className="text-[11px] text-red-400">{errors.accountNumber}</span>}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-white/35">Account name</span>
                  <input
                    className="bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400/50"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    onBlur={() => markTouched("accountName")}
                    placeholder="John Doe"
                  />
                  {show("accountName") && <span className="text-[11px] text-red-400">{errors.accountName}</span>}
                </label>
              </div>
            </div>

            <div className="text-sm text-white/60">
              Total buyer pays:{" "}
              <strong className="text-white">
                ₦{Number(cryptoAmount) > 0 && Number(nairaRate) > 0 ? (Number(cryptoAmount) * Number(nairaRate)).toLocaleString() : "—"}
              </strong>
            </div>
            <button
              onClick={handleCreate}
              disabled={selling || !formValid}
              className="w-full font-semibold px-6 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selling ? "Locking crypto & listing…" : "🔒 Lock crypto & list offer"}
            </button>
            {sellResult && <p className="text-sm text-green-400">{sellResult}</p>}
          </motion.div>
        )}

        {/* ── BUY: order book ── */}
        {mode === "buy" && (
          <>
            {loading && (
              <motion.div variants={fadeUp} className="flex items-center gap-3 opacity-60 text-sm border border-white/5 bg-white/[0.01] p-6 rounded-2xl">
                <svg className="w-5 h-5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Synchronizing order book…
              </motion.div>
            )}

            {loadError ? (
              <motion.div variants={fadeUp} className="border border-red-500/20 bg-red-500/[0.02] p-6 rounded-2xl">
                <ErrorNotice error={loadError} />
              </motion.div>
            ) : null}

            {!loading && !loadError && trades.length === 0 && (
              <motion.div variants={fadeUp} className="glass-panel p-12 rounded-[2rem] text-center">
                <svg className="w-12 h-12 mx-auto mb-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-white/50 text-sm">No open offers right now. Switch to Sell to create one.</p>
              </motion.div>
            )}

            <div className="flex flex-col gap-5">
              {trades.map((t) => {
                const isBusy = busyId === t.id;
                return (
                  <motion.div
                    key={t.id}
                    variants={fadeUp}
                    className="glass-panel glass-panel-interactive rounded-2xl flex flex-col md:flex-row items-center justify-between p-5 sm:p-6 md:p-8 gap-6"
                  >
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 w-full md:w-auto text-center sm:text-left">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="font-mono text-sm font-bold text-indigo-400">{t.assetType.slice(0, 3)}</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                          <span className="geist-heading text-3xl font-light">{t.cryptoAmount}</span>
                          <span className="text-sm font-semibold text-white/55">{t.assetType}</span>
                        </div>
                        <span className="font-mono text-xs text-white/40 mt-1">
                          Rate: ₦{parseFloat(t.nairaRate).toLocaleString()} / {t.assetType}
                        </span>
                        <span className="font-mono text-[10px] text-white/30 mt-1">Seller: {t.sellerWallet.slice(0, 10)}…</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                      <div className="text-center sm:text-right font-mono text-xs text-white/50">
                        <div>Total Value</div>
                        <div className="text-white text-lg font-semibold mt-0.5">₦{parseFloat(t.expectedAmount).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => handleAccept(t)}
                        disabled={busyId !== null}
                        className={`w-full sm:w-auto px-8 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 border border-white/10 transition-all duration-300 ${busyId !== null
                          ? "bg-white/5 text-white/40 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                          }`}
                      >
                        {isBusy ? "Accepting…" : "Accept Offer"}
                        <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Cryptographic ZK Proof Modal (real in-browser proving) ── */}
      <AnimatePresence>
        {proving && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="w-full max-w-md bg-[#0d1117] border border-white/10 rounded-[2rem] p-8 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                <div className="w-64 h-64 border-2 border-dashed border-indigo-500 rounded-full animate-[spin_60s_linear_infinite]" />
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/20 rounded-full blur-[60px] pointer-events-none" />
              <div className="relative z-10">
                <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center relative">
                  <div className="absolute inset-0 rounded-full border border-indigo-500/40 animate-ping opacity-25" />
                  <svg className="w-10 h-10 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="geist-heading text-2xl mb-3 text-white font-medium">Zero-Knowledge Proof</h3>
                <p className="text-white/40 text-sm font-mono tracking-wider uppercase mb-8">
                  {zk.status === "loading-circuit" ? "Loading circuit" : "Generating proof in-browser"}
                </p>
                <div className="space-y-2 text-left font-mono text-xs border border-white/5 bg-white/[0.01] p-4 rounded-xl max-h-40 overflow-auto">
                  {zk.log.map((line, i) => (
                    <div key={i} className="text-white/60">{line}</div>
                  ))}
                </div>
                <p className="text-white/50 text-xs mt-6 leading-relaxed font-light">
                  Your private credentials (BVN root & secret salt) never leave your browser. A real
                  zero-knowledge proof is generated locally and gates this action on-chain.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
