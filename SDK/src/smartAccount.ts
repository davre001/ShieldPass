import { PasskeyKit } from 'passkey-kit';

export interface PasskeyWalletConfig {
  rpcUrl: string;
  networkPassphrase: string;
  walletWasmHash: string; // factory wasm hash
}

export interface ConnectedWallet { keyId: string; contractId: string }

/**
 * Browser-only wrapper over passkey-kit. WebAuthn requires a DOM, so this must NEVER be
 * imported on the backend (and it is intentionally NOT re-exported from the SDK index — import
 * it directly via `@shieldpass/sdk/dist/passkey`). Provides: deploy a new smart wallet, connect
 * an existing one, and sign a transaction's auth entries with the device passkey.
 */
export class PasskeyWalletClient {
  private kit: PasskeyKit;

  constructor(cfg: PasskeyWalletConfig) {
    this.kit = new PasskeyKit({
      rpcUrl: cfg.rpcUrl,
      networkPassphrase: cfg.networkPassphrase,
      walletWasmHash: cfg.walletWasmHash,
    });
  }

  /** Create a new passkey + deploy its smart wallet. Returns the signed deploy XDR + identifiers. */
  async createWallet(app: string, user: string): Promise<{ keyId: string; contractId: string; signedDeployXdr: string }> {
    const res = await this.kit.createWallet(app, user);
    return { keyId: res.keyIdBase64, contractId: res.contractId, signedDeployXdr: res.signedTx.toXDR() };
  }

  /**
   * Reconnect to an existing wallet by its stored keyId. If the wallet's contract address is
   * already known (e.g. persisted from a prior session), pass it as `contractId` to bind directly
   * to that wallet and skip the on-chain lookup — this avoids relying on a derivation that can
   * fail or, after a re-deploy, resolve to a different contract.
   */
  async connectWallet(keyId?: string, contractId?: string): Promise<ConnectedWallet> {
    // No keyId → passkey-kit runs a WebAuthn discovery prompt (the user picks their passkey) and
    // derives the wallet from it. This is how login works on a NEW device with no stored keyId.
    const res = await this.kit.connectWallet({
      ...(keyId ? { keyId } : {}),
      ...(contractId ? { getContractId: async () => contractId } : {}),
    });
    return { keyId: res.keyIdBase64, contractId: res.contractId };
  }

  /**
   * Sign an assembled-transaction XDR's auth entries with the device passkey.
   * passkey-kit `sign` returns an AssembledTransaction; we serialize it back to XDR so the
   * signed tx can be POSTed to the backend Channels relayer submit endpoint.
   */
  async sign(xdr: string, keyId: string): Promise<string> {
    const signed = await this.kit.sign(xdr, { keyId });
    return signed.toXDR();
  }
}
