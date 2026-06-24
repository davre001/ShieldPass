import { useState } from "react";
import { motion } from "motion/react";
import { Buffer } from "buffer";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useSwapProof } from "../lib/useSwapProof";
import { useShieldedTransfer } from "../lib/useShieldedTransfer";
import ErrorNotice from "../components/ErrorNotice";

const SUPPORTED_ASSETS = [
  { code: "XLM", sac: import.meta.env.VITE_XLM_SAC as string | undefined },
  { code: "USDC", sac: import.meta.env.VITE_USDC_SAC as string | undefined },
  { code: "NGNC", sac: import.meta.env.VITE_NGNC_SAC as string | undefined },
].filter((a): a is { code: string; sac: string } => !!a.sac);

const isAddr = (s: string) => /^[GC][A-Z2-7]{55}$/.test(s);
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const isShp = (s: string) => s.startsWith("shp_");
// shielded recipient = a ShieldPass user (private transfer) when email/shp_, else an external wallet (unshield)
const isShieldPassUser = (s: string) => isEmail(s) || isShp(s);
const buf = (u8: Uint8Array): Buffer => Buffer.from(u8);

function randomField(): string {
  const a = new Uint8Array(31);
  crypto.getRandomValues(a);
  let h = "0x";
  for (const b of a) h += b.toString(16).padStart(2, "0");
  return BigInt(h).toString();
}

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as any } },
};

type Source = "available" | "shielded";

export default function SendPage() {
  const session = useSession();
  const swapProof = useSwapProof(import.meta.env.VITE_API_URL as string);
  const transfer = useShieldedTransfer(import.meta.env.VITE_API_URL as string);

  const [source, setSource] = useState<Source>("available");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState(SUPPORTED_ASSETS[0]?.code ?? "XLM");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isShielded = source === "shielded";
  const poolAsset = session.notes[0]?.asset ?? "XLM";
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  function switchSource(next: Source) {
    if (busy) return;
    setSource(next);
    setError(null); setSuccess(null); setAmount("");
  }

  // Public send: move wallet funds via the token SAC (whole units -> stroops).
  async function sendAvailable(to: string) {
    const asset = SUPPORTED_ASSETS.find((a) => a.code === assetCode);
    if (!asset) throw new Error("Asset not configured.");
    const human = Number(amount);
    if (!(human > 0)) throw new Error("Amount must be greater than zero.");
    const stroops = BigInt(Math.round(human * 1e7));
    await session.wallet!.invoke(asset.sac, "transfer", { from: session.address, to, amount: stroops });
    setSuccess(`Sent ${human} ${asset.code} to ${short(to)}.`);
    api.notify({ email: session.email, type: "SEND_PUBLIC", title: "Sent", amount: String(human), asset: asset.code }).catch(() => {});
  }

  // Send from shielded balance. Routes by recipient:
  //  - ShieldPass user (email / shp_ address) -> PRIVATE transfer (stays in the pool, fully private)
  //  - external Stellar address (G…/C…)       -> unshield (exits the pool, becomes public crypto)
  async function sendShielded(to: string) {
    let amt: bigint;
    try { amt = BigInt(amount.trim()); } catch { throw new Error("Enter a whole-number amount."); }
    if (amt <= 0n) throw new Error("Amount must be greater than zero.");

    if (isShieldPassUser(to)) {
      setStatus("Sending privately…");
      const ok = await transfer.send(to, amt);
      if (!ok) throw new Error(transfer.error || "Private transfer failed.");
      setSuccess(`Privately sent ${amt.toString()} ${poolAsset} to ${isShp(to) ? short(to) : to}. It stays shielded.`);
      api.notify({ email: session.email, type: "SEND_SHIELDED", title: "Sent privately", amount: amt.toString(), asset: poolAsset }).catch(() => {});
      return;
    }

    // external wallet -> unshield
    const escrowId = import.meta.env.VITE_ESCROW_CONTRACT_ID as string;
    const note = session.notes.find((n) => BigInt(n.amount) >= amt);
    if (!note) throw new Error("No single shielded note covers this amount.");
    const pr = await swapProof.generate(note, amt, { accountNumber: 0n, salt: BigInt(randomField()) }, false);
    if (!pr) throw new Error(swapProof.error || "Proof generation failed.");

    setStatus("Approve the send on your device…");
    await session.wallet!.invoke(escrowId, "unshield", {
      proof_a: buf(pr.proof.a), proof_b: buf(pr.proof.b), proof_c: buf(pr.proof.c),
      public_signals: pr.publicSignals.map(buf), recipient: to,
    });

    setStatus("Updating your balance…");
    const changeCommitment = BigInt("0x" + Buffer.from(pr.publicSignals[1]).toString("hex")).toString();
    const { index } = await api.treeInsert(changeCommitment);
    const changeNotes = BigInt(pr.changeNote.amount) > 0n ? [{
      amount: pr.changeNote.amount, asset: note.asset, randomness: pr.changeNote.randomness,
      leafIndex: index, compliance: note.compliance,
    }] : [];
    session.set({ notes: [...session.notes.filter((n) => n !== note), ...changeNotes] });
    setSuccess(`Sent ${amt.toString()} ${note.asset} to ${short(to)} (now public).`);
    api.notify({ email: session.email, type: "UNSHIELD", title: "Sent to wallet", amount: amt.toString(), asset: note.asset }).catch(() => {});
  }

  async function handleSend() {
    setError(null); setSuccess(null);
    if (!session.wallet || !session.address) { setError(new Error("Wallet not connected. Please log in again.")); return; }
    const to = recipient.trim();
    if (!amount) { setError(new Error("Enter an amount.")); return; }
    // Available -> must be a Stellar address. Shielded -> address OR ShieldPass user (email/shp_).
    const validRecipient = isShielded ? (isAddr(to) || isShieldPassUser(to)) : isAddr(to);
    if (!validRecipient) {
      setError(new Error(isShielded ? "Enter a Stellar address, an email, or a shp_ address." : "Enter a valid Stellar address (G… or C…)."));
      return;
    }

    try {
      setBusy(true);
      if (isShielded) await sendShielded(to); else await sendAvailable(to);
      setAmount(""); setRecipient("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const proving = swapProof.status === "fetching-path" || swapProof.status === "loading-circuit" || swapProof.status === "generating";

  return (
    <motion.div className="flex flex-col items-center w-full pt-4 sm:pt-6 pb-20 relative z-10" initial="hidden" animate="visible">
      <div className="w-full max-w-lg">
        <motion.div variants={fadeUp} className="text-center mb-8">
          <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">
            Send
          </h1>
          <p className="text-white/40 text-sm mt-2 font-light">
            Send to any Stellar address — from your public wallet or privately from your shielded balance.
          </p>
        </motion.div>

        {/* Source toggle */}
        <motion.div variants={fadeUp} className="flex p-1 mb-6 rounded-xl border border-white/10 bg-white/[0.02]">
          {(["available", "shielded"] as Source[]).map((s) => (
            <button key={s} onClick={() => switchSource(s)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${source === s ? "bg-indigo-600 text-white" : "text-white/50 hover:text-white/80"}`}>
              {s === "available" ? "From Available" : "From Shielded"}
            </button>
          ))}
        </motion.div>

        {error ? <div className="border border-red-500/20 bg-red-500/[0.02] p-4 rounded-2xl mb-6"><ErrorNotice error={error} /></div> : null}
        {success ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="border border-emerald-500/20 bg-emerald-500/[0.03] p-4 rounded-2xl mb-6 text-emerald-300 text-sm">{success}</motion.div>
        ) : null}

        <motion.div variants={fadeUp} className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 space-y-5">
          {!isShielded ? (
            <div>
              <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Asset</label>
              <select value={assetCode} onChange={(e) => setAssetCode(e.target.value)}
                className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500/40 transition-colors">
                {SUPPORTED_ASSETS.map((a) => <option key={a.code} value={a.code} className="bg-neutral-900">{a.code}</option>)}
              </select>
            </div>
          ) : null}

          <div>
            <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Recipient address</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="G… or C…"
              className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-indigo-500/40 transition-colors" />
          </div>

          <div>
            <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Amount ({isShielded ? poolAsset : assetCode})</label>
            <input type="number" min="0" step={isShielded ? "1" : "any"} inputMode={isShielded ? "numeric" : "decimal"}
              value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-lg outline-none focus:border-indigo-500/40 transition-colors" />
          </div>

          <div className="text-white/35 text-xs leading-relaxed border border-white/5 bg-white/[0.01] rounded-xl p-3">
            {isShielded
              ? <>You spend a private note — <span className="text-white/70">nobody can trace which deposit it came from</span>. The recipient receives normal (public) crypto in their wallet.</>
              : <>A normal <span className="text-white/70">public</span> on-chain transfer from your wallet. To send privately, switch to <span className="text-white/70">From Shielded</span>.</>}
          </div>

          <button onClick={handleSend}
            disabled={busy || !amount || !recipient || (session.onboarded && !session.wallet)}
            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {busy ? (proving ? "Generating proof…" : status || "Sending…") : (isShielded ? "Send privately" : "Send")}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
