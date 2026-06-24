import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Buffer } from "buffer";
import { noteCommitment, fieldToBytes32, type Compliance } from "@shieldpass/sdk";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useSwapProof } from "../lib/useSwapProof";
import ShieldedBalance from "../components/ShieldedBalance";
import ErrorNotice from "../components/ErrorNotice";

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

type Mode = "shield" | "unshield";

export default function DepositPage() {
  const navigate = useNavigate();
  const session = useSession();
  const swapProof = useSwapProof(import.meta.env.VITE_API_URL as string);

  const [mode, setMode] = useState<Mode>("shield");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const poolAsset = session.notes[0]?.asset ?? "XLM";

  function switchMode(next: Mode) {
    if (busy) return;
    setMode(next);
    setError(null); setSuccess(null); setAmount("");
  }

  // ── Shield: wallet -> private pool ──
  async function handleShield(amt: bigint) {
    const escrowId = import.meta.env.VITE_ESCROW_CONTRACT_ID as string;
    if (!session.identity) throw new Error("Shielded key locked — unlock it to shield funds.");
    const compliance: Compliance = {
      hardware_attested: 1n,
      bvn_verified: session.bvnVerified ? 1n : 0n,
      good_standing: 1n,
    };
    const randomness = randomField();
    // Note is owned by the user's shielded key (so only they can later spend it).
    const commitment = noteCommitment(amt, session.identity.owner, BigInt(randomness), compliance);

    setStatus("Approve the shielding on your device…");
    await session.wallet!.invoke(escrowId, "deposit", {
      user: session.address,
      amount: amt,
      note_commitment: buf(fieldToBytes32(commitment)),
    });

    setStatus("Adding your note to the shielded tree…");
    const { index } = await api.treeInsert(commitment.toString());

    session.set({
      notes: [...session.notes, {
        amount: amt.toString(), asset: poolAsset, randomness, leafIndex: index,
        compliance: { hardware_attested: "1", bvn_verified: session.bvnVerified ? "1" : "0", good_standing: "1" },
      }],
    });
    setSuccess(`Shielded ${amt.toString()} ${poolAsset} into your private balance.`);
    api.notify({ email: session.email, type: "SHIELD", title: "Shielded funds", amount: amt.toString(), asset: poolAsset }).catch(() => {});
  }

  // ── Unshield: private pool -> wallet ──
  async function handleUnshield(amt: bigint) {
    const escrowId = import.meta.env.VITE_ESCROW_CONTRACT_ID as string;
    const note = session.notes.find((n) => BigInt(n.amount) >= amt);
    if (!note) throw new Error("No single shielded note covers this amount. Try a smaller amount.");

    const pr = await swapProof.generate(note, amt, { accountNumber: 0n, salt: BigInt(randomField()) }, false);
    if (!pr) throw new Error(swapProof.error || "Proof generation failed.");

    setStatus("Approve the unshield on your device…");
    await session.wallet!.invoke(escrowId, "unshield", {
      proof_a: buf(pr.proof.a),
      proof_b: buf(pr.proof.b),
      proof_c: buf(pr.proof.c),
      public_signals: pr.publicSignals.map(buf),
      recipient: session.address,
    });

    setStatus("Updating your balance…");
    const changeCommitment = BigInt("0x" + Buffer.from(pr.publicSignals[1]).toString("hex")).toString();
    const { index } = await api.treeInsert(changeCommitment);
    const changeNotes = BigInt(pr.changeNote.amount) > 0n ? [{
      amount: pr.changeNote.amount, asset: note.asset, randomness: pr.changeNote.randomness,
      leafIndex: index, compliance: note.compliance,
    }] : [];
    session.set({ notes: [...session.notes.filter((n) => n !== note), ...changeNotes] });
    setSuccess(`Unshielded ${amt.toString()} ${note.asset} back to your wallet.`);
    api.notify({ email: session.email, type: "UNSHIELD", title: "Unshielded to wallet", amount: amt.toString(), asset: note.asset }).catch(() => {});
  }

  async function handleSubmit() {
    setError(null); setSuccess(null);
    if (!import.meta.env.VITE_ESCROW_CONTRACT_ID) { setError(new Error("Missing contract config.")); return; }
    if (!session.wallet || !session.address) { setError(new Error("Wallet not connected. Please log in again.")); return; }
    let amt: bigint;
    try { amt = BigInt(amount.trim()); } catch { setError(new Error("Enter a whole-number amount.")); return; }
    if (amt <= 0n) { setError(new Error("Amount must be greater than zero.")); return; }

    try {
      setBusy(true);
      if (mode === "shield") await handleShield(amt);
      else await handleUnshield(amt);
      setAmount("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const proving = swapProof.status === "fetching-path" || swapProof.status === "loading-circuit" || swapProof.status === "generating";
  const isShield = mode === "shield";

  return (
    <motion.div className="flex flex-col items-center w-full pt-4 sm:pt-6 pb-20 relative z-10" initial="hidden" animate="visible">
      <div className="w-full max-w-lg">
        <motion.div variants={fadeUp} className="text-center mb-8">
          <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">
            {isShield ? "Shield" : "Unshield"}
          </h1>
          <p className="text-white/40 text-sm mt-2 font-light">
            {isShield
              ? "Move funds from your wallet into your private shielded balance."
              : "Move funds from your private balance back into your wallet as crypto."}
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="mb-6">
          <ShieldedBalance />
        </motion.div>

        {/* Direction toggle */}
        <motion.div variants={fadeUp} className="flex p-1 mb-6 rounded-xl border border-white/10 bg-white/[0.02]">
          {(["shield", "unshield"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? "bg-indigo-600 text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              {m === "shield" ? "Shield" : "Unshield"}
            </button>
          ))}
        </motion.div>

        {error ? <div className="border border-red-500/20 bg-red-500/[0.02] p-4 rounded-2xl mb-6"><ErrorNotice error={error} /></div> : null}

        {success ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="border border-emerald-500/20 bg-emerald-500/[0.03] p-4 rounded-2xl mb-6 text-emerald-300 text-sm">
            {success}
            <button onClick={() => navigate(isShield ? "/withdraw" : "/dashboard")} className="ml-2 underline underline-offset-2 text-emerald-200">
              {isShield ? "Withdraw now →" : "View balance →"}
            </button>
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp} className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 space-y-5">
          <div>
            <label className="text-white/40 text-xs font-mono tracking-wider uppercase">
              {isShield ? `Amount (${poolAsset})` : "Amount to unshield"}
            </label>
            <input
              type="number" min="0" inputMode="numeric" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-lg outline-none focus:border-indigo-500/40 transition-colors"
            />
          </div>

          <div className="text-white/35 text-xs leading-relaxed border border-white/5 bg-white/[0.01] rounded-xl p-3">
            <p className="text-white/50 mb-1">How this works</p>
            {isShield
              ? <>You need the pool token in your wallet. The shielding transfer is <span className="text-white/70">public on-chain</span> — but once it's a shielded note, every withdrawal from it is <span className="text-white/70">private and unlinkable</span>.</>
              : <>A zero-knowledge proof is generated in your browser, then the pool sends the crypto to your smart wallet. The note you spend stays private.</>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={busy || !amount || (session.onboarded && !session.wallet)}
            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy
              ? (proving ? "Generating proof…" : status || (isShield ? "Shielding…" : "Unshielding…"))
              : (isShield ? "Shield funds" : "Unshield to wallet")}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
