import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Buffer } from "buffer";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useSwapProof } from "../lib/useSwapProof";
import { useShieldedTransfer } from "../lib/useShieldedTransfer";
import ErrorNotice from "../components/ErrorNotice";
import { PUBLIC_ASSETS, assetByCode, formatUnits, parseUnits } from "../lib/assets";
import { useWalletBalance } from "../lib/useWalletBalance";
import { addContact, loadContacts, removeContact, type SavedRecipient } from "../lib/bankVault";
import { useInsertProof } from "../lib/useInsertProof";

const isAddr = (value: string) => /^[GC][A-Z2-7]{55}$/.test(value);
const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const isShp = (value: string) => value.startsWith("shp_");
const isShieldPassUser = (value: string) => isEmail(value) || isShp(value);
const buf = (u8: Uint8Array): Buffer => Buffer.from(u8);

function randomField(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return BigInt(hex).toString();
}

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as any } },
};

type Source = "available" | "shielded";

function recipientKind(recipient: string): SavedRecipient["kind"] {
  if (isEmail(recipient)) return "email";
  if (isShp(recipient)) return "shielded";
  return "wallet";
}

function contactSort(a: SavedRecipient, b: SavedRecipient) {
  const aStamp = new Date(a.lastUsedAt ?? a.createdAt).getTime();
  const bStamp = new Date(b.lastUsedAt ?? b.createdAt).getTime();
  if (aStamp !== bStamp) return bStamp - aStamp;
  return a.label.localeCompare(b.label);
}

export default function SendPage() {
  const session = useSession();
  const swapProof = useSwapProof(import.meta.env.VITE_API_URL as string);
  const transfer = useShieldedTransfer(import.meta.env.VITE_API_URL as string);
  const { insertProof } = useInsertProof();

  const [source, setSource] = useState<Source>("available");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState<string>(PUBLIC_ASSETS[0]?.code ?? "XLM");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contacts, setContacts] = useState<SavedRecipient[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<unknown>(null);
  const [contactLabel, setContactLabel] = useState("");
  const [contactQuery, setContactQuery] = useState("");

  const isShielded = source === "shielded";
  const shieldedAssets = Array.from(new Set(session.notes.map((n) => n.asset || "XLM")));
  const selectedAsset = assetByCode(assetCode);
  const short = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

  const { balance: walletBalance, loading: walletLoading } = useWalletBalance(
    isShielded ? "" : assetCode,
    session.address,
  );
  const shieldedTotal = session.notes
    .filter((n) => (n.asset || "XLM") === assetCode)
    .reduce((sum, n) => sum + BigInt(n.amount), 0n);
  const shieldedBalanceStr = formatUnits(shieldedTotal, selectedAsset?.decimals ?? 7, 4);

  useEffect(() => {
    let cancelled = false;
    if (!session.email || !session.identity) {
      setContacts([]);
      setContactsError(null);
      setContactsLoading(false);
      return;
    }

    setContactsLoading(true);
    setContactsError(null);
    loadContacts(session.email)
      .then((items) => {
        if (!cancelled) setContacts(items.slice().sort(contactSort));
      })
      .catch((err) => {
        if (!cancelled) setContactsError(err);
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session.email, session.identity]);

  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    const list = contacts.slice().sort(contactSort);
    if (!query) return list;
    return list.filter((item) =>
      [item.label, item.recipient, item.kind, item.asset ?? ""].some((field) => field.toLowerCase().includes(query)),
    );
  }, [contacts, contactQuery]);

  function updateContactList(next: SavedRecipient[]) {
    setContacts(next.slice().sort(contactSort));
  }

  async function saveRecipient() {
    const to = recipient.trim();
    if (!session.email || !session.identity) throw new Error("Unlock your vault before saving recipients.");
    if (!to) throw new Error("Enter a recipient first.");

    const now = new Date().toISOString();
    const kind = recipientKind(to);
    const next = await addContact(session.email, {
      id: `${kind}:${to.toLowerCase()}`,
      label: contactLabel.trim() || to,
      recipient: to,
      kind,
      asset: assetCode,
      createdAt: now,
      lastUsedAt: now,
    });

    updateContactList(next);
    setContactLabel("");
  }

  async function useRecipient(contact: SavedRecipient) {
    const now = new Date().toISOString();
    setRecipient(contact.recipient);
    setContactLabel(contact.label);

    if (contact.kind === "wallet") setSource("available");
    else setSource("shielded");

    if (contact.asset) setAssetCode(contact.asset);

    if (session.email && session.identity) {
      const next = await addContact(session.email, { ...contact, lastUsedAt: now });
      updateContactList(next);
    }
  }

  async function deleteRecipient(contactId: string) {
    if (!session.email || !session.identity) return;
    const next = await removeContact(session.email, contactId);
    updateContactList(next);
  }

  function switchSource(next: Source) {
    if (busy) return;
    setSource(next);
    if (next === "shielded" && shieldedAssets.length > 0) setAssetCode(shieldedAssets[0]);
    if (next === "available" && PUBLIC_ASSETS.length > 0) setAssetCode(PUBLIC_ASSETS[0].code);
    setError(null);
    setSuccess(null);
    setAmount("");
  }

  async function sendAvailable(to: string) {
    const asset = PUBLIC_ASSETS.find((a) => a.code === assetCode);
    if (!asset) throw new Error("Asset not configured.");
    const units = parseUnits(amount, asset.decimals);
    if (units <= 0n) throw new Error("Amount must be greater than zero.");
    // Use transferToken instead of invoke — native SACs (XLM etc.) have no uploadable
    // Wasm, so contract.Client.from() crashes. transferToken builds XDR directly.
    await session.wallet!.transferToken(asset.sac, to, units);
    setSuccess(`Sent ${formatUnits(units, asset.decimals, 4)} ${asset.code} to ${short(to)}.`);
    api.notify({ email: session.email, type: "SEND_PUBLIC", title: "Sent", amount: formatUnits(units, asset.decimals, 4), asset: asset.code }).catch(() => {});
  }

  async function sendShielded(to: string) {
    if (!selectedAsset) throw new Error("Asset not configured.");

    let amt: bigint;
    try {
      amt = parseUnits(amount, selectedAsset.decimals);
    } catch {
      throw new Error("Enter a valid amount.");
    }

    if (amt <= 0n) throw new Error("Amount must be greater than zero.");

    if (isShieldPassUser(to)) {
      setStatus("Sending privately...");
      const ok = await transfer.send(to, amt, selectedAsset.code);
      if (!ok) throw new Error(transfer.error || "Private transfer failed.");

      setSuccess(`Privately sent ${formatUnits(amt, selectedAsset.decimals, 4)} ${selectedAsset.code} to ${isShp(to) ? short(to) : to}. It stays shielded.`);
      api.notify({ email: session.email, type: "SEND_SHIELDED", title: "Sent privately", amount: formatUnits(amt, selectedAsset.decimals, 4), asset: selectedAsset.code }).catch(() => {});
      return;
    }

    const note = session.notes.find((n) => n.asset === selectedAsset.code && BigInt(n.amount) >= amt);
    if (!note) throw new Error(`No single shielded ${selectedAsset.code} note covers this amount.`);

    const pr = await swapProof.generate(note, amt, { accountNumber: 0n, salt: BigInt(randomField()) }, false);
    if (!pr) throw new Error(swapProof.error || "Proof generation failed.");

    setStatus("Approve the send on your device...");
    await session.wallet!.invoke(selectedAsset.poolContractId, "unshield", {
      proof_a: buf(pr.proof.a),
      proof_b: buf(pr.proof.b),
      proof_c: buf(pr.proof.c),
      public_signals: pr.publicSignals.map(buf),
      recipient: to,
    });

    setStatus("Updating your balance...");
    const changeCommitment = BigInt("0x" + Buffer.from(pr.publicSignals[1]).toString("hex")).toString();
    const { index } = await insertProof(changeCommitment, setStatus);
    const changeNotes = BigInt(pr.changeNote.amount) > 0n ? [{
      amount: pr.changeNote.amount,
      asset: note.asset,
      randomness: pr.changeNote.randomness,
      leafIndex: index,
      compliance: note.compliance,
    }] : [];

    session.set({ notes: [...session.notes.filter((n) => n !== note), ...changeNotes] });
    setSuccess(`Sent ${formatUnits(amt, selectedAsset.decimals, 4)} ${note.asset} to ${short(to)} (now public).`);
    api.notify({ email: session.email, type: "UNSHIELD", title: "Sent to wallet", amount: formatUnits(amt, selectedAsset.decimals, 4), asset: note.asset }).catch(() => {});
  }

  async function handleSend() {
    setError(null);
    setSuccess(null);

    if (!session.wallet || !session.address) {
      setError(new Error("Wallet not connected. Please log in again."));
      return;
    }

    const to = recipient.trim();
    if (!amount) {
      setError(new Error("Enter an amount."));
      return;
    }

    const validRecipient = isShielded ? (isAddr(to) || isShieldPassUser(to)) : isAddr(to);
    if (!validRecipient) {
      setError(new Error(isShielded ? "Enter a Stellar address, an email, or a shp_ address." : "Enter a valid Stellar address (G... or C...)."));
      return;
    }

    try {
      setBusy(true);
      if (isShielded) await sendShielded(to);
      else await sendAvailable(to);
      setAmount("");
      setRecipient("");
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
      <div className="w-full max-w-5xl">
        <motion.div variants={fadeUp} className="text-center mb-8">
          <h1 className="geist-heading text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent font-medium">
            Send
          </h1>
          <p className="text-white/40 text-sm mt-2 font-light">
            Send to any Stellar address - from your public wallet or privately from your shielded balance.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="flex p-1 mb-6 rounded-xl border border-white/10 bg-white/[0.02]">
          {(["available", "shielded"] as Source[]).map((item) => (
            <button
              key={item}
              onClick={() => switchSource(item)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${source === item ? "bg-indigo-600 text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {item === "available" ? "From Available" : "From Shielded"}
            </button>
          ))}
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-6">
            {error ? (
              <div className="border border-red-500/20 bg-red-500/[0.02] p-4 rounded-2xl">
                <ErrorNotice error={error} />
              </div>
            ) : null}

            {success ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-emerald-500/20 bg-emerald-500/[0.03] p-4 rounded-2xl text-emerald-300 text-sm"
              >
                {success}
              </motion.div>
            ) : null}

            <motion.div variants={fadeUp} className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 backdrop-blur-xl border border-blue-500/20 shadow-2xl rounded-3xl p-6 space-y-5 font-display text-blue-50">
              <div>
                <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Asset</label>
                <select
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                  className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500/40 transition-colors"
                >
                  {(isShielded ? shieldedAssets : PUBLIC_ASSETS.map((a) => a.code)).map((code) => (
                    <option key={code} value={code} className="bg-neutral-900">
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Recipient address</label>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="G... or C..."
                  className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-indigo-500/40 transition-colors"
                />
                <p className="mt-2 text-[11px] text-white/35 leading-relaxed">
                  Save trusted recipients in the vault, then tap them on the right to reuse the same destination quickly.
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Amount ({assetCode})</label>
                  <span className="text-[11px] text-white/35">
                    {isShielded
                      ? `Shielded: ${shieldedBalanceStr} ${assetCode}`
                      : walletLoading
                      ? "Loading balance…"
                      : walletBalance != null
                      ? `Available: ${walletBalance} ${assetCode}`
                      : null}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step={isShielded ? "1" : "any"}
                  inputMode={isShielded ? "numeric" : "decimal"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-lg outline-none focus:border-indigo-500/40 transition-colors"
                />
              </div>

              <div className="text-white/35 text-xs leading-relaxed border border-white/5 bg-white/[0.01] rounded-xl p-3">
                {isShielded ? (
                  <>
                    You spend a private note - <span className="text-white/70">nobody can trace which deposit it came from</span>. The recipient receives normal (public) crypto in their wallet.
                  </>
                ) : (
                  <>
                    A normal <span className="text-white/70">public</span> on-chain transfer from your wallet. To send privately, switch to <span className="text-white/70">From Shielded</span>.
                  </>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={busy || !amount || !recipient || (session.onboarded && !session.wallet)}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? (proving ? "Generating proof..." : status || "Sending...") : (isShielded ? "Send privately" : "Send")}
              </button>
            </motion.div>
          </div>

          <motion.aside variants={fadeUp} className="bg-gradient-to-br from-blue-900/30 to-indigo-900/20 backdrop-blur-xl border border-blue-500/20 shadow-2xl rounded-3xl p-6 text-blue-50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">Vault contacts</p>
                <h2 className="geist-heading text-2xl mt-2 font-medium">Saved recipients</h2>
                <p className="text-white/40 text-sm mt-2 leading-relaxed">
                  These live inside the same encrypted bank vault as your saved bank details.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-mono text-white/60">
                {filteredContacts.length}
              </span>
            </div>

            <div className="mt-5">
              <label className="text-white/40 text-xs font-mono tracking-wider uppercase">Search</label>
              <input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Filter by name, address, or type"
                className="mt-2 w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500/40 transition-colors"
              />
            </div>

            <div className="mt-5 space-y-3">
              {contactsLoading ? (
                <div className="text-sm text-white/45 border border-white/5 bg-white/[0.01] rounded-2xl p-4">Loading contacts...</div>
              ) : contactsError ? (
                <div className="text-sm text-red-300 border border-red-500/20 bg-red-500/[0.02] rounded-2xl p-4">
                  <ErrorNotice error={contactsError} />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-sm text-white/45 border border-white/5 bg-white/[0.01] rounded-2xl p-5 leading-relaxed">
                  No saved recipients yet. Send to a few trusted people, then save them here for faster repeat transfers.
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div key={contact.id} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors">
                    <button
                      type="button"
                      onClick={() => void useRecipient(contact)}
                      className="w-full text-left flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-white font-medium truncate">{contact.label}</span>
                          <span className="text-[10px] uppercase tracking-[0.25em] px-2 py-1 rounded-full border border-white/10 text-white/45">
                            {contact.kind}
                          </span>
                          {contact.asset ? (
                            <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                              {contact.asset}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs font-mono text-white/45 break-all">{contact.recipient}</div>
                        <div className="mt-2 text-[11px] text-white/30">
                          {contact.lastUsedAt ? `Last used ${new Date(contact.lastUsedAt).toLocaleDateString()}` : `Saved ${new Date(contact.createdAt).toLocaleDateString()}`}
                        </div>
                      </div>
                      <span className="text-white/25 group-hover:text-white/60 transition-colors">Use</span>
                    </button>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/25">
                        {contact.kind === "wallet" ? "Public wallet" : "ShieldPass user"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteRecipient(contact.id)}
                        className="text-xs text-white/35 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-5 border-t border-white/10">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">Quick save</p>
              <h3 className="mt-2 text-sm font-medium text-white">Store the current recipient</h3>
              <div className="mt-4 space-y-3">
                <input
                  value={contactLabel}
                  onChange={(e) => setContactLabel(e.target.value)}
                  placeholder="Label, alias, or note"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500/40 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => void saveRecipient()}
                  disabled={!recipient || busy || (session.onboarded && !session.identity)}
                  className="w-full py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save recipient
                </button>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </motion.div>
  );
}
