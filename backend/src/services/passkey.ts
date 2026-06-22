const rpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

/**
 * Submit a passkey-signed transaction XDR gaslessly via the OpenZeppelin Channels relayer.
 *
 * passkey-kit's package entry also pulls in browser/WebAuthn modules (`PasskeyKit` uses
 * `@simplewebauthn/browser`), so we import it LAZILY inside this function — that keeps the
 * backend boot + the vitest suite free of browser-only deps. `PasskeyServer` itself is
 * server-side (relayer + Mercury) and is the only piece we touch here.
 *
 * NOTE: requires real `CHANNELS_URL`/`CHANNELS_API_KEY` — OpenZeppelin Channels, the relayer that
 * replaced the now-discontinued Launchtube (archived Mar 2026). passkey-kit's `PasskeyServer`
 * wraps `ChannelsClient` internally and submits the full signed XDR, so this is just a config
 * swap. Mercury (the indexer) is optional — its fields are only passed when the corresponding
 * env vars are set. Cannot be fully verified without Channels credentials.
 */
export async function submitSigned(signedXdr: string): Promise<string> {
  const { PasskeyServer } = await import('passkey-kit');
  const server = new PasskeyServer({
    rpcUrl,
    relayerUrl: process.env.CHANNELS_URL || '',
    relayerApiKey: process.env.CHANNELS_API_KEY || '',
    // Mercury is optional: only include its fields when configured, so an unset indexer doesn't
    // get passed as empty strings.
    ...(process.env.MERCURY_URL ? { mercuryUrl: process.env.MERCURY_URL } : {}),
    ...(process.env.MERCURY_JWT ? { mercuryJwt: process.env.MERCURY_JWT } : {}),
    ...(process.env.MERCURY_PROJECT_NAME ? { mercuryProjectName: process.env.MERCURY_PROJECT_NAME } : {}),
  });
  const res: any = await server.send(signedXdr);
  return res?.hash ?? res?.txHash ?? res?.id ?? String(res);
}
