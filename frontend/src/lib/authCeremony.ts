import { deriveIdentityFromSeed, deriveSeed, type IdentitySource } from "./shieldedKey";
import { unlockBankVault } from "./bankVault";

export interface IdentityMaterial {
  source: IdentitySource;
  seed: Uint8Array;
}

export interface IdentityCeremonyDeps {
  prompt?: (message: string) => string | null;
}

async function tryPasskeySeed(credentialId?: string): Promise<Uint8Array> {
  return deriveSeed({ kind: "passkey", credentialId });
}

export async function resolveIdentityMaterial(
  email: string,
  credentialId?: string,
  deps: IdentityCeremonyDeps = {},
): Promise<IdentityMaterial> {
  try {
    const seed = await tryPasskeySeed(credentialId);
    return { source: { kind: "passkey", credentialId }, seed };
  } catch {
    const prompt = deps.prompt ?? globalThis.prompt?.bind(globalThis);
    const recovery = prompt?.("Passkey PRF is unavailable here. Enter your recovery phrase to derive your shielded identity:");
    if (recovery && recovery.trim()) {
      const seed = await deriveSeed({ kind: "recovery", phrase: recovery.trim() });
      return { source: { kind: "recovery", phrase: recovery.trim() }, seed };
    }
    const password = prompt?.("Use a password instead. Save it carefully; you'll need it on other devices:");
    if (password && password.trim()) {
      const seed = await deriveSeed({ kind: "password", password: password.trim(), email });
      return { source: { kind: "password", password: password.trim(), email }, seed };
    }
    throw new Error("A passkey recovery phrase or password is required.");
  }
}

export async function unlockIdentityAndVault(email: string, credentialId?: string, deps: IdentityCeremonyDeps = {}) {
  const material = await resolveIdentityMaterial(email, credentialId, deps);
  const identity = deriveIdentityFromSeed(material.seed);
  await unlockBankVault(material.seed, email);
  return { material, identity };
}
