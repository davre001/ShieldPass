import { deriveShieldedIdentity, type ShieldedIdentity } from "@shieldpass/sdk";
import { argon2idAsync } from "@noble/hashes/argon2.js";

const PRF_SALT = new TextEncoder().encode("shieldpass-prf-v3");
const RECOVERY_SALT = new TextEncoder().encode("shieldpass-recovery-v1");
const PASSWORD_SALT_PREFIX = "shieldpass-password-v1:";

function b64urlToBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function pbkdf2Seed(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

/** Derive the 32-byte shielded seed from the passkey via WebAuthn PRF. */
export async function deriveSeedFromPasskey(credentialIdB64?: string): Promise<Uint8Array> {
  if (typeof navigator === "undefined" || !navigator.credentials) {
    throw new Error("WebAuthn unavailable in this environment.");
  }
  const publicKey: any = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: credentialIdB64 ? [{ id: toArrayBuffer(b64urlToBytes(credentialIdB64)), type: "public-key" }] : [],
    userVerification: "required",
    extensions: { prf: { eval: { first: toArrayBuffer(PRF_SALT) } } },
  };
  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Passkey assertion cancelled.");
  const prf = (assertion.getClientExtensionResults() as any).prf?.results?.first as ArrayBuffer | undefined;
  if (!prf) throw new Error("PRF unavailable");
  return new Uint8Array(prf);
}

export async function deriveSeedFromRecoveryPhrase(phrase: string): Promise<Uint8Array> {
  const normalized = phrase.trim();
  if (!normalized) throw new Error("Recovery phrase is required.");
  return pbkdf2Seed(normalized, RECOVERY_SALT, 210_000);
}

export async function deriveSeedFromPassword(password: string, email: string): Promise<Uint8Array> {
  const normalized = password.trim();
  if (!normalized) throw new Error("Password is required.");
  return argon2idAsync(
    new TextEncoder().encode(normalized),
    new TextEncoder().encode(`${PASSWORD_SALT_PREFIX}${email.trim().toLowerCase()}`),
    { t: 3, m: 64 * 1024, p: 1, dkLen: 32 },
  );
}

export function deriveIdentityFromSeed(seed: Uint8Array): ShieldedIdentity {
  return deriveShieldedIdentity(seed);
}

export async function deriveIdentityFromPasskey(credentialIdB64?: string): Promise<ShieldedIdentity> {
  return deriveIdentityFromSeed(await deriveSeedFromPasskey(credentialIdB64));
}

export async function deriveIdentityFromRecoveryPhrase(phrase: string): Promise<ShieldedIdentity> {
  return deriveIdentityFromSeed(await deriveSeedFromRecoveryPhrase(phrase));
}

export async function deriveIdentityFromPassword(password: string, email: string): Promise<ShieldedIdentity> {
  return deriveIdentityFromSeed(await deriveSeedFromPassword(password, email));
}

export type IdentitySource =
  | { kind: "passkey"; credentialId?: string }
  | { kind: "recovery"; phrase: string }
  | { kind: "password"; password: string; email: string };

export async function deriveIdentity(source: IdentitySource): Promise<ShieldedIdentity> {
  switch (source.kind) {
    case "passkey":
      return deriveIdentityFromPasskey(source.credentialId);
    case "recovery":
      return deriveIdentityFromRecoveryPhrase(source.phrase);
    case "password":
      return deriveIdentityFromPassword(source.password, source.email);
  }
}

export async function deriveSeed(source: IdentitySource): Promise<Uint8Array> {
  switch (source.kind) {
    case "passkey":
      return deriveSeedFromPasskey(source.credentialId);
    case "recovery":
      return deriveSeedFromRecoveryPhrase(source.phrase);
    case "password":
      return deriveSeedFromPassword(source.password, source.email);
  }
}
