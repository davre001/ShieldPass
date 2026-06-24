import { deriveShieldedIdentity, type ShieldedIdentity } from "@shieldpass/sdk";

// Fixed PRF salt — the per-credential hmac-secret is deterministic for this salt,
// so the same passkey always yields the same shielded identity (survives PIN reset).
const PRF_SALT = new TextEncoder().encode("shieldpass-prf-v2");

function b64urlToBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Derive the 32-byte shielded seed from the passkey via the WebAuthn PRF (hmac-secret)
 * extension. Requires the passkey to have been CREATED with `extensions: { prf: {} }`.
 * Browser-only — must be tested against a real authenticator.
 *
 * Throws if PRF is unavailable (caller should fall back to a recovery phrase).
 */
export async function deriveSeedFromPasskey(credentialIdB64?: string): Promise<Uint8Array> {
  if (typeof navigator === "undefined" || !navigator.credentials) {
    throw new Error("WebAuthn unavailable in this environment.");
  }
  // WebAuthn glue with the non-standard PRF extension — typed as `any` to avoid lib.dom friction.
  const publicKey: any = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: credentialIdB64 ? [{ id: b64urlToBytes(credentialIdB64), type: "public-key" }] : [],
    userVerification: "required",
    extensions: { prf: { eval: { first: PRF_SALT } } },
  };
  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Passkey assertion cancelled.");
  const prf = (assertion.getClientExtensionResults() as any).prf?.results?.first as ArrayBuffer | undefined;
  if (!prf) throw new Error("Passkey PRF not available — re-register with PRF, or use a recovery phrase.");
  return new Uint8Array(prf);
}

/** Derive the full shielded identity from the passkey (PRF). */
export async function deriveIdentityFromPasskey(credentialIdB64?: string): Promise<ShieldedIdentity> {
  return deriveShieldedIdentity(await deriveSeedFromPasskey(credentialIdB64));
}

/**
 * Get the shielded identity: passkey PRF (preferred, survives PIN reset) with a PIN-derived
 * fallback when PRF isn't available on the device/credential. The fallback carries the
 * "changing your PIN orphans old notes" caveat — see the V2 spec.
 */
export async function deriveIdentity(credentialId: string | undefined, pin: string, email: string): Promise<ShieldedIdentity> {
  try {
    return await deriveIdentityFromPasskey(credentialId);
  } catch (e) {
    console.warn('[shieldedKey] passkey PRF unavailable, using PIN-derived fallback:', e);
    return deriveIdentityFromPhrase(`${pin}:${email}`);
  }
}

/** Fallback: derive identity from a recovery phrase / arbitrary secret string. */
export function deriveIdentityFromPhrase(phrase: string): ShieldedIdentity {
  const seed = new Uint8Array(32);
  const enc = new TextEncoder().encode(phrase);
  // simple stretch: fold the phrase bytes into 32 bytes (sufficient; entropy is the phrase's)
  for (let i = 0; i < enc.length; i++) seed[i % 32] ^= enc[i];
  return deriveShieldedIdentity(seed);
}
