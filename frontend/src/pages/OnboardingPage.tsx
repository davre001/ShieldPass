import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { makeWallet, submitSigned } from "../lib/passkey";
import { humanizeError } from "@shieldpass/sdk/dist/errors";

type Stage = "info" | "verifying" | "confirm" | "passkey" | "deploying" | "done" | "error";

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: "blur(6px)", scale: 0.98 },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", scale: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as any } },
};
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } } };

const inputCls = "font-mono w-full bg-white/[0.02] border border-white/10 rounded-xl px-5 py-4 text-white placeholder:text-white/20 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none";
const btnPrimary = "w-full font-semibold px-6 py-4 rounded-xl flex items-center justify-center gap-2 border border-white/10 transition-all duration-300 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer";
const btnDisabled = "w-full font-semibold px-6 py-4 rounded-xl flex items-center justify-center gap-2 border border-white/10 bg-white/5 text-white/40 cursor-not-allowed";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const session = useSession();

  const [stage, setStage] = useState<Stage>("info");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [bvn, setBvn] = useState("");
  const [legalName, setLegalName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const infoValid = /\S+@\S+\.\S+/.test(email) && /^\d{4,6}$/.test(pin);
  const bvnValid = /^\d{11}$/.test(bvn);

  async function verify() {
    setErrorMessage(null);
    setStage("verifying");
    try {
      const r = await api.submitBvn({ email, phone, bvn, pin });
      setLegalName(r.returnedName);
      session.set({ email, phone, name: r.returnedName, secretSalt: r.secretSalt, merkleRoot: r.merkleRoot });
      setStage("confirm");
    } catch (err) {
      setStage("error");
      setErrorMessage(humanizeError(err).title);
    }
  }

  async function createPasskey() {
    setErrorMessage(null);
    setStage("deploying");
    try {
      const wallet = await makeWallet();
      const res = await wallet.createWallet("ShieldPass", email);
      await submitSigned(res.signedDeployXdr);
      await api.linkWallet({ email, smartWalletAddress: res.contractId, passkeyKeyId: res.keyId });
      session.set({ wallet, keyId: res.keyId, address: res.contractId });
      setStage("done");
    } catch (err) {
      setStage("error");
      setErrorMessage(humanizeError(err).title);
    }
  }

  return (
    <div className="flex items-center justify-center w-full py-12 relative z-10">
      <motion.div
        className="w-full max-w-lg glass-panel rounded-[2rem] p-8 md:p-12 relative overflow-hidden shadow-2xl"
        variants={stagger} initial="hidden" animate="visible"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -ml-16 -mb-16" />

        <motion.p variants={fadeUp} className="font-mono text-xs uppercase tracking-widest text-indigo-400 mb-4 font-semibold">
          Verification Protocol
        </motion.p>
        <motion.h1 variants={fadeUp} className="geist-heading text-3xl md:text-4xl mb-4 bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent font-medium">
          {stage === "done" ? "You're live" : "Create your account"}
        </motion.h1>
        <motion.p variants={fadeUp} className="text-white/60 text-sm mb-10 leading-relaxed font-light">
          Demo onboarding: a mock BVN check returns your legal name, then a passkey secures your
          wallet — deployed gaslessly, no seed phrase or XLM needed.
        </motion.p>

        {stage === "info" && (
          <motion.div variants={fadeUp} className="space-y-5 relative z-10">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <input className={inputCls} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="Phone (0812…)" />
            <input className={inputCls} inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Create a 4-6 digit PIN" />
            <button className={infoValid ? btnPrimary : btnDisabled} disabled={!infoValid} onClick={() => setStage("verifying")}>Continue</button>
          </motion.div>
        )}

        {(stage === "verifying" || (stage === "error" && !legalName)) && (
          <motion.div variants={fadeUp} className="space-y-5 relative z-10">
            <input className={inputCls} inputMode="numeric" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ""))} placeholder="11-digit BVN" />
            {errorMessage && <p className="text-sm text-red-400 font-medium">{errorMessage}</p>}
            <button className={bvnValid ? btnPrimary : btnDisabled} disabled={!bvnValid} onClick={verify}>Verify BVN</button>
          </motion.div>
        )}

        {stage === "confirm" && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 relative z-10">
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <p className="text-white/40 uppercase tracking-wider text-[10px] mb-2">BVN registered to</p>
              <p className="text-2xl text-white font-medium">{legalName}</p>
              <p className="text-white/50 text-sm mt-2">Is this you?</p>
            </div>
            <div className="flex gap-3">
              <button className={btnPrimary} onClick={() => setStage("passkey")}>Yes, continue</button>
              <button className="px-6 py-4 rounded-xl border border-white/10 text-white/60 hover:text-white transition-all" onClick={() => { setLegalName(""); setStage("verifying"); }}>Not me</button>
            </div>
          </motion.div>
        )}

        {(stage === "passkey" || stage === "deploying") && (
          <motion.div variants={fadeUp} className="space-y-6 relative z-10">
            <p className="text-white/70 text-sm">Secure your account with Face ID / fingerprint. Your wallet deploys silently — gasless.</p>
            <p className="text-white/40 text-xs">No fingerprint or Face ID? Use your Windows Hello PIN, or scan the prompt's QR with your phone.</p>
            <button className={stage === "deploying" ? btnDisabled : btnPrimary} disabled={stage === "deploying"} onClick={createPasskey}>
              {stage === "deploying" ? "Creating passkey & deploying wallet…" : "Create Passkey"}
            </button>
          </motion.div>
        )}

        {stage === "error" && legalName && (
          <motion.div variants={fadeUp} className="space-y-4 relative z-10">
            <p className="text-sm text-red-400 font-medium">{errorMessage}</p>
            <button className={btnPrimary} onClick={() => setStage("passkey")}>Try again</button>
          </motion.div>
        )}

        {stage === "done" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="border border-green-500/20 bg-green-500/[0.02] rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl pointer-events-none" />
            <p className="text-green-400 text-sm font-semibold mb-6 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Verified — {legalName}
            </p>
            <dl className="space-y-4 font-mono text-xs text-white/70">
              <div>
                <dt className="mb-2 text-white/40 uppercase tracking-wider text-[10px]">Smart wallet (passkey)</dt>
                <dd className="break-all border border-white/5 bg-white/[0.01] p-3.5 rounded-lg text-white font-mono select-all">{session.address}</dd>
              </div>
            </dl>
            <button onClick={() => navigate("/marketplace")} className="mt-8 w-full font-semibold px-6 py-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2">
              Enter Marketplace
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
