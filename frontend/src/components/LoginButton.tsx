import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { makeWallet } from "../lib/passkey";
import { api } from "../lib/api";
import { humanizeError } from "@shieldpass/sdk/dist/errors";

/**
 * "Log in" for returning users.
 *  - Same device (localStorage intact): reconnect the passkey by stored keyId; salt/root reused.
 *  - New device (no stored session): WebAuthn discovery picks the passkey → derive the wallet,
 *    look up the account by wallet, then re-issue a fresh compliance salt (it's client-only and
 *    unrecoverable). The fresh salt yields a new merkleRoot — fine on testnet.
 */
export default function LoginButton({ className }: { className?: string }) {
  const session = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setBusy(true);
    try {
      const wallet = await makeWallet();
      const res = session.keyId
        ? await wallet.connectWallet(session.keyId, session.address ?? undefined) // same device
        : await wallet.connectWallet(); // new device → WebAuthn discovery
      const address = res.contractId;
      const keyId = res.keyId;

      // Recover the account: stored email, otherwise look it up by the identified wallet.
      let email = session.email, name = session.name, phone = session.phone;
      if (!email) {
        const acct = await api.getAccount(address);
        email = acct.email;
        name = acct.name ?? "";
        phone = acct.phone ?? "";
      }

      const pin = window.prompt("Enter your PIN to log in:") || "";
      const { ok } = await api.verifyPin({ email, pin });
      if (!ok) { alert("Incorrect PIN."); return; }

      // The compliance salt is client-only; if it's missing (new device) mint a fresh one.
      let secretSalt = session.secretSalt, merkleRoot = session.merkleRoot;
      if (!secretSalt || !merkleRoot) {
        const re = await api.reissueSalt({ email, pin });
        secretSalt = re.secretSalt;
        merkleRoot = re.merkleRoot;
      }

      session.set({ wallet, keyId, address, email, name, phone, secretSalt, merkleRoot });
      navigate("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
      alert(humanizeError(err).title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={handleLogin} disabled={busy} className={className}>
      {busy ? "Logging in…" : "Log in"}
    </button>
  );
}
