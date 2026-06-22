import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';
import { Keypair, Transaction, hash, xdr } from '@stellar/stellar-sdk';

const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';

// passkey-kit builds its deploy/invoke transactions with this deterministic, PUBLIC placeholder
// as the source account: Keypair.fromRawEd25519Seed(hash('kalepail')). The relayer is the real
// fee payer, so we can re-sign with it after rewriting the fee.
const WALLET_KEYPAIR = Keypair.fromRawEd25519Seed(hash(Buffer.from('kalepail')));

/**
 * OpenZeppelin Channels requires a Soroban transaction's `fee` to equal EXACTLY its resource fee
 * (Channels covers the inclusion fee on top). stellar-sdk assembles deploy txs as
 * `resourceFee + inclusionFee` (~2× the resource fee here), which Channels rejects with
 * FEE_MISMATCH. We rewrite the fee down to the resource fee and re-sign with passkey-kit's
 * (public, deterministic) source key. No-op for non-Soroban / fee-bump envelopes.
 */
function matchFeeToResourceFee(signedXdr: string): string {
  const env = new Transaction(signedXdr, NETWORK).toEnvelope();
  if (env.switch() !== xdr.EnvelopeType.envelopeTypeTx()) return signedXdr;

  const v1 = env.v1();
  const inner = v1.tx();
  const ext = inner.ext();
  if (ext.switch() !== 1) return signedXdr; // 1 === SorobanTransactionData present

  const resourceFee = Number(ext.sorobanData().resourceFee().toString());
  if (!Number.isSafeInteger(resourceFee) || resourceFee > 0xffffffff) return signedXdr; // fee is a Uint32
  if (inner.fee() === resourceFee) return signedXdr; // already correct

  inner.fee(resourceFee);
  v1.signatures([]); // fee changed → previous signature is stale

  const rebuilt = new Transaction(env, NETWORK);
  rebuilt.sign(WALLET_KEYPAIR);
  return rebuilt.toXDR();
}

/**
 * Submit a passkey-signed transaction XDR gaslessly via the OpenZeppelin Channels relayer.
 *
 * We call ChannelsClient directly rather than passkey-kit's `PasskeyServer`: passkey-kit ships
 * raw TypeScript (`main: src/index.ts`), so importing it under plain Node throws
 * ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING. `PasskeyServer.send()` only wraps
 * `channelsClient.submitTransaction({ xdr })`, and @openzeppelin/relayer-plugin-channels is a
 * compiled package — so we use it directly. Requires CHANNELS_URL / CHANNELS_API_KEY.
 */
export async function submitSigned(signedXdr: string): Promise<string> {
  const baseUrl = process.env.CHANNELS_URL;
  const apiKey = process.env.CHANNELS_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('Channels relayer not configured (set CHANNELS_URL and CHANNELS_API_KEY).');
  }

  const client = new ChannelsClient({ baseUrl, apiKey });
  const res: any = await client.submitTransaction({ xdr: matchFeeToResourceFee(signedXdr) });
  return res?.hash ?? res?.txHash ?? res?.id ?? String(res);
}
