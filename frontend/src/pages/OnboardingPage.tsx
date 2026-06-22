import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { makeWallet, submitSigned } from "../lib/passkey";
import { humanizeError } from "@shieldpass/sdk/dist/errors";

<<<<<<< HEAD
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ChevronLeftIcon, Grid2x2PlusIcon } from "lucide-react";
import { AnimatedLayout } from "../components/ui/animated-characters-login-page";

type Stage = "info" | "verifying" | "confirm" | "passkey" | "deploying" | "done" | "error";
=======
type Stage = "info" | "passkey" | "deploying" | "done" | "error";
>>>>>>> 1de7bf6428721d979a345a66f8aaf96edcd16d64

const fadeUp = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4 } },
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const session = useSession();

  const [stage, setStage] = useState<Stage>("info");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const infoValid = /\S+@\S+\.\S+/.test(email) && /^\d{4,6}$/.test(pin);

  const [isTyping, setIsTyping] = useState(false);

  async function createPasskey() {
    setErrorMessage(null);
    setStage("deploying");
    try {
      let check;
      try {
        check = await api.verifyPin({ email, pin });
      } catch (e: any) {
        if (e.message && e.message.includes("No user")) check = null;
        else throw e;
      }

      if (check && !check.ok) {
        throw new Error("Incorrect PIN for existing account.");
      }

      let wallet, keyId, address, secretSalt, merkleRoot, bvnVerified = false;

      if (check?.ok && check.passkeyKeyId && check.smartWalletAddress) {
        // --- LOGIN FLOW ---
        wallet = await makeWallet();
        await wallet.connectWallet(check.passkeyKeyId); // Prompts Face ID / Touch ID
        
        const reissue = await api.reissueSalt({ email, pin });
        keyId = check.passkeyKeyId;
        address = check.smartWalletAddress;
        secretSalt = reissue.secretSalt;
        merkleRoot = reissue.merkleRoot;
        bvnVerified = reissue.bvnVerified;
      } else {
        // --- SIGNUP FLOW ---
        wallet = await makeWallet();
        const res = await wallet.createWallet("ShieldPass", email);
        await submitSigned(res.signedDeployXdr);
        
        const linkRes = await api.linkWallet({ email, pin, smartWalletAddress: res.contractId, passkeyKeyId: res.keyId });
        keyId = res.keyId;
        address = res.contractId;
        secretSalt = linkRes.secretSalt;
        merkleRoot = linkRes.merkleRoot;
      }
      
      session.set({ 
        wallet, keyId, address, email, secretSalt, merkleRoot, bvnVerified
      });
      setStage("done");
    } catch (err) {
      setStage("error");
      setErrorMessage(humanizeError(err).title);
    }
  }

  return (
    <AnimatedLayout showPassword={false} passwordLength={pin.length} isTyping={isTyping}>
      <div className="relative w-full sm:w-[400px] mx-auto space-y-6">
        <Button variant="ghost" className="absolute -top-16 -left-4 text-muted-foreground hover:text-foreground" asChild>
          <button onClick={() => navigate("/")}>
            <ChevronLeftIcon className='size-4 me-2' />
            Home
          </button>
        </Button>
        
        <div className="lg:hidden mb-4">
          <span className="nav-logo">SHIELDPASS</span>
        </div>
        
        <div className="flex flex-col space-y-1">
          <h1 className="font-heading text-3xl font-bold tracking-wide">
            {stage === "done" ? "You're live" : "Create your account"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {stage === "info" && "Demo onboarding: a mock BVN check returns your legal name, then a passkey secures your wallet."}
            {stage === "verifying" && "Enter your BVN to verify your identity."}
            {stage === "confirm" && "Please confirm your details."}
            {(stage === "passkey" || stage === "deploying") && "Secure your account with Face ID / fingerprint."}
            {stage === "error" && "An error occurred during verification."}
            {stage === "done" && "Your wallet has been successfully deployed."}
          </p>
        </div>

<<<<<<< HEAD
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
          {stage === "info" && (
            <motion.div variants={fadeUp} className="space-y-4">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} placeholder="you@example.com" className="bg-input border-border text-foreground placeholder:text-muted-foreground" />
              <Input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} placeholder="Phone (0812…)" className="bg-input border-border text-foreground placeholder:text-muted-foreground" />
              <Input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} placeholder="Create a 4-6 digit PIN" className="bg-input border-border text-foreground placeholder:text-muted-foreground" />
              <Button size="lg" className="w-full mt-2" disabled={!infoValid} onClick={() => setStage("verifying")}>
                Continue
              </Button>
            </motion.div>
          )}

          {(stage === "verifying" || (stage === "error" && !legalName)) && (
            <motion.div variants={fadeUp} className="space-y-4">
              <Input inputMode="numeric" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ""))} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} placeholder="11-digit BVN" className="bg-input border-border text-foreground placeholder:text-muted-foreground" />
              {errorMessage && <p className="text-sm text-destructive font-medium">{errorMessage}</p>}
              <Button size="lg" className="w-full mt-2" disabled={!bvnValid} onClick={verify}>
                Verify BVN
              </Button>
            </motion.div>
          )}

          {stage === "confirm" && (
            <motion.div variants={fadeUp} className="space-y-6">
              <div className="border border-border bg-card rounded-xl p-6">
                <p className="text-muted-foreground uppercase tracking-wider text-[10px] mb-2">BVN registered to</p>
                <p className="text-2xl font-medium">{legalName}</p>
                <p className="text-muted-foreground text-sm mt-2">Is this you?</p>
              </div>
              <div className="flex gap-3">
                <Button size="lg" className="flex-1" onClick={() => setStage("passkey")}>Yes, continue</Button>
                <Button size="lg" variant="outline" className="flex-1 border-border text-foreground hover:bg-muted" onClick={() => { setLegalName(""); setStage("verifying"); }}>Not me</Button>
              </div>
            </motion.div>
          )}

          {(stage === "passkey" || stage === "deploying") && (
            <motion.div variants={fadeUp} className="space-y-6">
              <p className="text-muted-foreground text-sm">No fingerprint or Face ID? Use your Windows Hello PIN, or scan the prompt's QR with your phone.</p>
              <Button size="lg" className="w-full" disabled={stage === "deploying"} onClick={createPasskey}>
                {stage === "deploying" ? "Creating passkey & deploying wallet…" : "Create Passkey"}
              </Button>
            </motion.div>
          )}

          {stage === "error" && legalName && (
            <motion.div variants={fadeUp} className="space-y-4">
              <p className="text-sm text-destructive font-medium">{errorMessage}</p>
              <Button size="lg" className="w-full" onClick={() => setStage("passkey")}>Try again</Button>
            </motion.div>
          )}

          {stage === "done" && (
            <motion.div variants={fadeUp} className="border border-border bg-card rounded-xl p-6 relative overflow-hidden">
              <p className="text-primary text-sm font-semibold mb-6 flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                Verified — {legalName}
              </p>
              <dl className="space-y-4 font-mono text-xs text-foreground">
                <div>
                  <dt className="mb-2 uppercase tracking-wider text-[10px] text-muted-foreground">Smart wallet (passkey)</dt>
                  <dd className="break-all border border-border bg-muted p-3.5 rounded-lg font-mono select-all">{session.address}</dd>
                </div>
              </dl>
              <Button size="lg" className="w-full mt-8" onClick={() => navigate("/marketplace")}>
                Enter Marketplace
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatedLayout>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `var(--color-primary)`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full text-primary"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.05 + path.id * 0.01}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
=======
        <motion.p variants={fadeUp} className="font-mono text-xs uppercase tracking-widest text-indigo-400 mb-4 font-semibold">
          Web2 Onboarding
        </motion.p>
        <motion.h1 variants={fadeUp} className="geist-heading text-3xl md:text-4xl mb-4 bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent font-medium">
          {stage === "done" ? "You're live" : "Create your account"}
        </motion.h1>
        <motion.p variants={fadeUp} className="text-white/60 text-sm mb-10 leading-relaxed font-light">
          No seed phrases. Secure your account with Face ID / fingerprint. Your smart wallet deploys silently.
        </motion.p>

        {stage === "info" && (
          <motion.div variants={fadeUp} className="space-y-5 relative z-10">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <input className={inputCls} inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Create a 4-6 digit PIN" />
            <button className={infoValid ? btnPrimary : btnDisabled} disabled={!infoValid} onClick={() => setStage("passkey")}>Continue</button>
          </motion.div>
        )}

        {(stage === "passkey" || stage === "deploying") && (
          <motion.div variants={fadeUp} className="space-y-6 relative z-10">
            <p className="text-white/70 text-sm">Secure your account with Face ID / fingerprint. Your wallet deploys silently — gasless.</p>
            <p className="text-white/40 text-xs">No fingerprint or Face ID? Use your Windows Hello PIN, or scan the prompt's QR with your phone.</p>
            <button className={stage === "deploying" ? btnDisabled : btnPrimary} disabled={stage === "deploying"} onClick={createPasskey}>
              {stage === "deploying" ? "Authenticating…" : "Secure Account"}
            </button>
          </motion.div>
        )}

        {stage === "error" && (
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
              Account Secured
            </p>
            <dl className="space-y-4 font-mono text-xs text-white/70">
              <div>
                <dt className="mb-2 text-white/40 uppercase tracking-wider text-[10px]">Smart wallet (passkey)</dt>
                <dd className="break-all border border-white/5 bg-white/[0.01] p-3.5 rounded-lg text-white font-mono select-all">{session.address}</dd>
              </div>
            </dl>
            <button onClick={() => navigate("/swap")} className="mt-8 w-full font-semibold px-6 py-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2">
              Start Swapping
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </motion.div>
        )}
      </motion.div>
>>>>>>> 1de7bf6428721d979a345a66f8aaf96edcd16d64
    </div>
  );
}
