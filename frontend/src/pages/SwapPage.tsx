import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useZkProof } from "../lib/useZkProof";
import { submitSigned } from "../lib/passkey";
import ErrorNotice from "../components/ErrorNotice";
import type { BankAccount, Quote } from "../types";

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

const SUPPORTED_ASSETS = [
  { code: "XLM", label: "XLM — Stellar Lumens", sac: import.meta.env.VITE_XLM_SAC as string | undefined },
  { code: "USDC", label: "USDC — USD Coin", sac: import.meta.env.VITE_USDC_SAC as string | undefined },
  { code: "NGNC", label: "NGNC — Naira Coin", sac: import.meta.env.VITE_NGNC_SAC as string | undefined },
].filter((a): a is { code: string; label: string; sac: string } => !!a.sac);

const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "050", name: "Ecobank" },
  { code: "011", name: "First Bank" },
  { code: "058", name: "GTBank" },
  { code: "50211", name: "Kuda" },
  { code: "50515", name: "Moniepoint" },
  { code: "999992", name: "OPay" },
  { code: "033", name: "UBA" },
  { code: "057", name: "Zenith Bank" },
];

export default function SwapPage() {
  const navigate = useNavigate();
  const session = useSession();
  const zk = useZkProof();

  // Swap State
  const [assetType, setAssetType] = useState(SUPPORTED_ASSETS[0]?.code ?? "");
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  // Bank Account State
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [showAddBank, setShowAddBank] = useState(false);
  
  // New Bank Form State
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [addingBank, setAddingBank] = useState(false);

  // BVN Modal State
  const [showBvnModal, setShowBvnModal] = useState(false);
  const [bvn, setBvn] = useState("");
  const [bvnError, setBvnError] = useState<string | null>(null);
  const [verifyingBvn, setVerifyingBvn] = useState(false);

  const proving = zk.status === "loading-circuit" || zk.status === "generating";

  useEffect(() => {
    if (session.email) {
      api.listBanks(session.email).then(data => {
        setBanks(data);
        if (data.length > 0 && !selectedBankId) {
          const def = data.find(b => b.isDefault) || data[0];
          setSelectedBankId(def.id);
        }
      }).catch(console.error);
    }
  }, [session.email]);

  useEffect(() => {
    const val = Number(cryptoAmount);
    if (!val || val <= 0) {
      setQuote(null);
      return;
    }
    const token = SUPPORTED_ASSETS.find(a => a.code === assetType);
    if (!token) return;

    setQuoteLoading(true);
    const delay = setTimeout(() => {
      api.quote({ tokenAddress: token.sac, cryptoAmount: val, assetCode: token.code })
        .then(res => {
          setQuote(res);
          setActionError(null);
        })
        .catch(err => setActionError(err))
        .finally(() => setQuoteLoading(false));
    }, 500);
    return () => clearTimeout(delay);
  }, [cryptoAmount, assetType]);

  async function handleAddBank() {
    if (!bankCode || !/^\d{10}$/.test(accountNumber) || accountName.trim().length < 2) {
      setActionError("Please fill out all bank details correctly.");
      return;
    }
    const bankName = NIGERIAN_BANKS.find(b => b.code === bankCode)?.name || bankCode;
    try {
      setAddingBank(true);
      const res = await api.addBank({
        email: session.email,
        bankName,
        accountNumber,
        accountName,
      });
      setBanks([...banks, res.account]);
      setSelectedBankId(res.account.id);
      setShowAddBank(false);
      setBankCode("");
      setAccountNumber("");
      setAccountName("");
    } catch (err) {
      setActionError(err);
    } finally {
      setAddingBank(false);
    }
  }

  async function handleBvnUpgrade() {
    setBvnError(null);
    if (!/^\d{11}$/.test(bvn)) {
      setBvnError("Enter a valid 11-digit BVN.");
      return;
    }
    try {
      setVerifyingBvn(true);
      const r = await api.submitBvn({ email: session.email, bvn });
      session.set({ ...session, name: r.returnedName, secretSalt: r.secretSalt, merkleRoot: r.merkleRoot, bvnVerified: true });
      setShowBvnModal(false);
      handleSwap(true); // resume swap knowing bvn is now true
    } catch (err: any) {
      setBvnError(err.message || "Verification failed");
    } finally {
      setVerifyingBvn(false);
    }
  }

  async function handleSwap(skipBvnCheck = false) {
    setActionError(null);
    setSwapSuccess(null);

    if (!session.onboarded || !session.address || !session.wallet) {
      setActionError("Complete onboarding + connect your passkey first.");
      return;
    }
    if (!session.secretSalt || !session.merkleRoot) {
      setActionError("Missing attestation — re-onboard.");
      return;
    }
    if (!selectedBankId) {
      setActionError("Please select a bank account to receive the Naira.");
      return;
    }
    if (!quote || quote.nairaAmount <= 0) {
      setActionError("Invalid swap amount.");
      return;
    }

    // Progression: Tier 2 check
    if (quote.requireBvn && !session.bvnVerified && !skipBvnCheck) {
      setShowBvnModal(true);
      return;
    }

    const token = SUPPORTED_ASSETS.find(a => a.code === assetType);
    const escrowId = import.meta.env.VITE_ESCROW_CONTRACT_ID as string;
    if (!token || !escrowId) {
      setActionError("Missing smart contract config.");
      return;
    }

    try {
      setSwapping(true);
      const pr = await zk.generateProof(session.secretSalt, session.merkleRoot, quote.requireBvn ? 1 : 0);
      if (!pr) throw new Error(zk.error || "Proof generation failed.");

      const { StellarContractClient } = await import("@shieldpass/sdk/dist/stellar");
      const { Networks } = await import("@stellar/stellar-sdk");
      const stellar = new StellarContractClient("https://soroban-testnet.stellar.org", Networks.TESTNET, escrowId);
      
      // 1. Lock on-chain
      const created = await stellar.lockSwap(
        { user: session.address, tokenAddress: token.sac, amount: BigInt(cryptoAmount), nullifier: pr.nullifier },
        { kind: "passkey", sign: (xdr: string) => session.wallet!.sign(xdr, session.keyId), submit: submitSigned }
      );

      // 2. Execute Fiat via Backend
      const exec = await api.executeSwap({
        email: session.email,
        bankAccountId: selectedBankId,
        tokenAddress: token.sac,
        assetCode: token.code,
        cryptoAmount: Number(cryptoAmount),
        onChainSwapId: String(created.swapId),
        proof: pr.proof,
        publicInputs: pr.publicInputs,
        nullifier: pr.nullifier,
      });

      setSwapSuccess(`Success! ${exec.message}`);
      setCryptoAmount("");
      setQuote(null);
    } catch (err) {
      setActionError(err);
    } finally {
      setSwapping(false);
    }
  }

  return (
    <motion.div
      className="flex flex-col items-center w-full pt-4 sm:pt-6 pb-20 relative z-10"
      variants={stagger} initial="hidden" animate="visible"
    >
      <div className="w-full max-w-lg">
        <motion.div variants={fadeUp} className="text-center mb-8">
          <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">
            Instant Swap
          </h1>
          <p className="text-white/40 text-sm mt-2 font-light">
            Trustless off-ramp. Crypto is time-locked until Naira hits your bank.
          </p>
        </motion.div>

        {actionError ? (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="border border-red-500/20 bg-red-500/[0.02] p-4 rounded-2xl mb-6">
            <ErrorNotice error={actionError} />
          </motion.div>
        ) : null}

        {swapSuccess ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="border border-green-500/20 bg-green-500/[0.02] p-6 rounded-2xl mb-6 text-center">
            <p className="text-green-400 font-medium">{swapSuccess}</p>
            <button onClick={() => navigate("/dashboard")} className="mt-4 text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-all font-mono">View Dashboard</button>
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-6 mb-8 space-y-6">
          {/* Pay Amount */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs text-white/50 font-medium uppercase tracking-wider">You Sell</span>
            </div>
            <div className="flex bg-white/[0.02] border border-white/10 rounded-xl p-2 focus-within:border-indigo-400/50 transition-colors">
              <input
                type="number" min="0" inputMode="decimal"
                className="w-full bg-transparent text-2xl px-3 outline-none text-white font-medium"
                value={cryptoAmount} onChange={(e) => setCryptoAmount(e.target.value)} placeholder="0.00"
              />
              <select
                className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-white font-semibold outline-none cursor-pointer"
                value={assetType} onChange={(e) => setAssetType(e.target.value)}
              >
                {SUPPORTED_ASSETS.map((a) => <option key={a.code} value={a.code}>{a.code}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-center -my-3 relative z-10">
            <div className="bg-[#0d1117] border border-white/10 rounded-full p-2 shadow-xl">
              <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
            </div>
          </div>

          {/* Receive Amount */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs text-white/50 font-medium uppercase tracking-wider">You Receive</span>
              {quoteLoading && <span className="text-xs text-indigo-400 animate-pulse">Calculating...</span>}
            </div>
            <div className="flex bg-white/[0.01] border border-white/5 rounded-xl p-4 transition-colors opacity-80">
              <span className="w-full bg-transparent text-2xl outline-none text-white font-medium">
                {quote ? `₦${quote.nairaAmount.toLocaleString()}` : "₦0.00"}
              </span>
              <span className="px-3 py-1 text-white/60 font-semibold text-lg">NGN</span>
            </div>
            {quote && quote.requireBvn && !session.bvnVerified && (
              <p className="text-xs text-amber-400/80 px-1 pt-1">⚠️ This amount requires Tier 2 Identity Verification (BVN).</p>
            )}
          </div>

          {/* Payout Bank Selection */}
          <div className="pt-4 border-t border-white/5">
            <p className="text-xs text-white/50 font-medium mb-3">Send Naira To</p>
            {banks.length === 0 || showAddBank ? (
              <div className="space-y-3 bg-white/[0.02] border border-white/10 p-4 rounded-xl">
                <select className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-white outline-none text-sm" value={bankCode} onChange={e => setBankCode(e.target.value)}>
                  <option value="">Select Bank...</option>
                  {NIGERIAN_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
                <input className="w-full bg-transparent border-b border-white/10 px-2 py-2 text-white outline-none text-sm placeholder:text-white/20" maxLength={10} value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="10-digit Account Number" />
                <input className="w-full bg-transparent border-b border-white/10 px-2 py-2 text-white outline-none text-sm placeholder:text-white/20" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Account Holder Name" />
                <div className="flex gap-2">
                  <button onClick={handleAddBank} disabled={addingBank} className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs py-2 rounded-lg transition-all">{addingBank ? "Saving..." : "Save Bank"}</button>
                  {banks.length > 0 && <button onClick={() => setShowAddBank(false)} className="px-4 text-white/50 hover:text-white text-xs">Cancel</button>}
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <select className="flex-1 bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none cursor-pointer text-sm" value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)}>
                  {banks.map(b => <option key={b.id} value={b.id} className="bg-zinc-900">{b.bankName} - {b.accountNumber}</option>)}
                </select>
                <button onClick={() => setShowAddBank(true)} className="px-4 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/5 text-white/60 hover:text-white transition-all text-xl" title="Add new bank">+</button>
              </div>
            )}
          </div>

          <button
            onClick={() => handleSwap()}
            disabled={swapping || !quote || !selectedBankId || quoteLoading}
            className="w-full font-semibold px-6 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {swapping ? "Executing Swap..." : (quote?.requireBvn && !session.bvnVerified ? "Verify Identity to Swap" : "Swap Now")}
          </button>
        </motion.div>
      </div>

      {/* ── BVN Upgrade Modal ── */}
      <AnimatePresence>
        {showBvnModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="w-full max-w-sm bg-[#0d1117] border border-white/10 rounded-[2rem] p-8 shadow-2xl">
              <h3 className="geist-heading text-2xl mb-2 text-white font-medium">Identity Required</h3>
              <p className="text-white/60 text-sm mb-6">Large swaps require Tier 2 Identity. Please verify your BVN once to permanently unlock high limits.</p>
              <input type="text" maxLength={11} className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 mb-2 font-mono" placeholder="11-digit BVN" value={bvn} onChange={e => setBvn(e.target.value.replace(/\D/g, ""))} />
              {bvnError && <p className="text-red-400 text-xs mb-4">{bvnError}</p>}
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowBvnModal(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-white/60 hover:text-white transition-all">Cancel</button>
                <button onClick={handleBvnUpgrade} disabled={verifyingBvn || bvn.length !== 11} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all">{verifyingBvn ? "Verifying..." : "Verify BVN"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cryptographic ZK Proof Modal ── */}
      <AnimatePresence>
        {proving && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="w-full max-w-md bg-[#0d1117] border border-white/10 rounded-[2rem] p-8 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none"><div className="w-64 h-64 border-2 border-dashed border-indigo-500 rounded-full animate-[spin_60s_linear_infinite]" /></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/20 rounded-full blur-[60px] pointer-events-none" />
              <div className="relative z-10">
                <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center relative">
                  <div className="absolute inset-0 rounded-full border border-indigo-500/40 animate-ping opacity-25" />
                  <svg className="w-10 h-10 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="geist-heading text-2xl mb-3 text-white font-medium">Zero-Knowledge Proof</h3>
                <p className="text-white/40 text-sm font-mono tracking-wider uppercase mb-8">{zk.status === "loading-circuit" ? "Loading circuit" : "Generating proof in-browser"}</p>
                <div className="space-y-2 text-left font-mono text-xs border border-white/5 bg-white/[0.01] p-4 rounded-xl max-h-40 overflow-auto">
                  {zk.log.map((line, i) => <div key={i} className="text-white/60">{line}</div>)}
                </div>
                <p className="text-white/50 text-xs mt-6 leading-relaxed font-light">Your private credentials never leave your browser. A real ZK proof is generated locally to gate this action on-chain.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
