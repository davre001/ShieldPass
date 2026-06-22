import { rpc, Contract, Keypair, Networks, TransactionBuilder, Account, BASE_FEE, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { CreateOfferParams, Signer } from './types';
import { isValidSorobanAddress } from './utils';

// Validates a Stellar public key (G... address, 56 chars)
function isValidStellarAddress(address: string): boolean {
    return typeof address === 'string' && /^G[A-Z2-7]{55}$/.test(address);
}

export class StellarContractClient {
    private server: rpc.Server;
    private networkPassphrase: string;
    private contractId: string;

    constructor(rpcUrl: string, networkPassphrase: string, contractId: string) {
        if (!rpcUrl) throw new Error('[StellarContractClient] rpcUrl is required');
        if (!networkPassphrase) throw new Error('[StellarContractClient] networkPassphrase is required');
        if (!contractId) throw new Error('[StellarContractClient] contractId is required');

        this.server = new rpc.Server(rpcUrl);
        this.networkPassphrase = networkPassphrase;
        this.contractId = contractId;
    }

    /**
     * One-time contract setup: sets the platform arbiter address (the only party
     * allowed to release escrowed crypto). Call once after deploying the contract,
     * signed by the deployer.
     */
    async initialize(arbiterAddress: string, signerKeypair: Keypair): Promise<string> {
        if (!isValidStellarAddress(arbiterAddress)) {
            throw new Error('[StellarContractClient] Invalid arbiter address.');
        }
        const contract = new Contract(this.contractId);
        const accountInfo = await this.server.getAccount(signerKeypair.publicKey());
        const account = new Account(signerKeypair.publicKey(), accountInfo.sequenceNumber());

        let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(contract.call('init', nativeToScVal(arbiterAddress, { type: 'address' })))
            .setTimeout(30)
            .build();

        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim)) {
            throw new Error(`[StellarContractClient] init simulation failed: ${JSON.stringify(sim)}`);
        }
        tx = rpc.assembleTransaction(tx, sim).build();
        tx.sign(signerKeypair);
        const sent = await this.server.sendTransaction(tx);
        console.log(`[StellarContractClient] init submitted! Hash: ${sent.hash}`);
        return sent.hash;
    }

    /**
     * Creates a P2P escrow offer on-chain by calling create_offer on the contract.
     * The caller (seller) must sign the transaction via their wallet (e.g. Freighter).
     * @param params Validated offer parameters including the ZK nullifier
     * @param signerKeypair The keypair that will sign the transaction (seller or relayer)
     */
    async createOffer(params: CreateOfferParams, signer: Signer): Promise<{ hash: string; offerId: bigint }> {
        // Input validation (seller + token are Soroban addresses — accept G... or C... smart wallets)
        if (!isValidSorobanAddress(params.sellerWallet)) {
            throw new Error('[StellarContractClient] Invalid seller wallet address.');
        }
        if (!isValidSorobanAddress(params.tokenAddress)) {
            throw new Error('[StellarContractClient] Invalid token contract address.');
        }
        if (!params.nullifier || params.nullifier.length === 0) {
            throw new Error('[StellarContractClient] ZK nullifier is required to create an offer.');
        }
        if (params.amount <= 0n) {
            throw new Error('[StellarContractClient] Amount must be greater than zero.');
        }

        const contract = new Contract(this.contractId);

        // Convert nullifier string to 32-byte buffer for Soroban BytesN<32>
        const nullifierBytes = Buffer.alloc(32);
        const nullifierHex = params.nullifier.replace('0x', '').padStart(64, '0').slice(0, 64);
        Buffer.from(nullifierHex, 'hex').copy(nullifierBytes);

        const op = contract.call(
            'create_offer',
            nativeToScVal(params.sellerWallet, { type: 'address' }),
            nativeToScVal(params.tokenAddress, { type: 'address' }),
            nativeToScVal(params.amount, { type: 'i128' }),
            xdr.ScVal.scvBytes(nullifierBytes),
        );

        if (signer.kind === 'keypair') {
            const accountInfo = await this.server.getAccount(signer.keypair.publicKey());
            const account = new Account(signer.keypair.publicKey(), accountInfo.sequenceNumber());
            let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
                .addOperation(op).setTimeout(30).build();
            const sim = await this.server.simulateTransaction(tx);
            if (!rpc.Api.isSimulationSuccess(sim)) {
                throw new Error(`[StellarContractClient] Simulation failed: ${JSON.stringify(sim)}`);
            }
            tx = rpc.assembleTransaction(tx, sim).build();
            tx.sign(signer.keypair);
            const sent = await this.server.sendTransaction(tx);
            console.log(`[StellarContractClient] create_offer submitted! Hash: ${sent.hash}`);
            return { hash: sent.hash, offerId: await this.decodeOfferId(sent.hash) };
        }

        // passkey: build + simulate + assemble, then hand the XDR to the caller's WebAuthn signer
        // and gasless submit relay. The smart wallet (params.sellerWallet, a C-address) authorizes
        // via its passkey auth entry; the Channels relayer (in signer.submit) is the fee source.
        // The tx envelope still needs a classic G-source — the relayer re-sources/re-signs for fees,
        // so a throwaway keypair is fine here. (A C-address is NOT a valid Account id → "accountId is invalid".)
        const account = new Account(Keypair.random().publicKey(), '0');
        let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(op).setTimeout(30).build();
        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim)) {
            throw new Error(`[StellarContractClient] Simulation failed: ${JSON.stringify(sim)}`);
        }
        tx = rpc.assembleTransaction(tx, sim).build();
        const signedXdr = await signer.sign(tx.toXDR());
        const hash = await signer.submit(signedXdr);
        console.log(`[StellarContractClient] create_offer (passkey) submitted! Hash: ${hash}`);
        return { hash, offerId: await this.decodeOfferId(hash) };
    }

    /** Poll getTransaction until the tx is SUCCESS, then decode its return value (a u64 offer id). */
    private async decodeOfferId(hash: string): Promise<bigint> {
        for (let i = 0; i < 20; i++) {
            const r = await this.server.getTransaction(hash);
            if (r.status === rpc.Api.GetTransactionStatus.SUCCESS && r.returnValue) {
                return BigInt(scValToNative(r.returnValue) as number | bigint);
            }
            if (r.status === rpc.Api.GetTransactionStatus.FAILED) {
                throw new Error('[StellarContractClient] create_offer transaction failed.');
            }
            await new Promise((res) => setTimeout(res, 1000));
        }
        throw new Error('[StellarContractClient] create_offer result not available (timed out).');
    }

    /**
     * Read-only: returns the contract's current offer counter (the id of the most recently created
     * offer). Uses a simulated transaction — no signer, no fee, nothing submitted.
     */
    async getOfferCount(): Promise<bigint> {
        const contract = new Contract(this.contractId);
        const account = new Account(Keypair.random().publicKey(), '0');
        const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(contract.call('get_offer_count'))
            .setTimeout(30)
            .build();
        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
            throw new Error(`[StellarContractClient] get_offer_count simulation failed: ${JSON.stringify(sim)}`);
        }
        return BigInt(scValToNative(sim.result.retval) as number | bigint);
    }

    /**
     * Read-only: a Stellar Asset Contract (SAC) token balance for an address. Simulated, no signer.
     * Returns the raw i128 balance as a bigint (0n if the account holds none / sim has no result).
     */
    async getTokenBalance(tokenId: string, address: string): Promise<bigint> {
        const contract = new Contract(tokenId);
        const account = new Account(Keypair.random().publicKey(), '0');
        const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(contract.call('balance', nativeToScVal(address, { type: 'address' })))
            .setTimeout(30)
            .build();
        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) return 0n;
        return BigInt(scValToNative(sim.result.retval) as number | bigint);
    }

    /**
     * Funds a wallet by transferring a Stellar Asset Contract (SAC) token from a source account
     * to `to`. Used to seed brand-new passkey smart wallets (C-addresses) with test tokens from the
     * relayer — friendbot can't fund contract addresses, so tokens must be moved in via the SAC.
     * Signed by `sourceKeypair` (a funded classic G-account that holds the token, e.g. the relayer).
     * Returns the submitted tx hash.
     */
    async fundWallet(tokenId: string, to: string, amount: bigint, sourceKeypair: Keypair): Promise<string> {
        if (!isValidSorobanAddress(tokenId)) {
            throw new Error('[StellarContractClient] Invalid token contract address.');
        }
        if (!isValidSorobanAddress(to)) {
            throw new Error('[StellarContractClient] Invalid destination wallet address.');
        }
        if (amount <= 0n) {
            throw new Error('[StellarContractClient] Funding amount must be greater than zero.');
        }

        const contract = new Contract(tokenId);
        const accountInfo = await this.server.getAccount(sourceKeypair.publicKey());
        const account = new Account(sourceKeypair.publicKey(), accountInfo.sequenceNumber());

        let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(contract.call(
                'transfer',
                nativeToScVal(sourceKeypair.publicKey(), { type: 'address' }),
                nativeToScVal(to, { type: 'address' }),
                nativeToScVal(amount, { type: 'i128' }),
            ))
            .setTimeout(30)
            .build();

        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim)) {
            throw new Error(`[StellarContractClient] fundWallet simulation failed: ${JSON.stringify(sim)}`);
        }
        tx = rpc.assembleTransaction(tx, sim).build();
        tx.sign(sourceKeypair);
        const sent = await this.server.sendTransaction(tx);
        console.log(`[StellarContractClient] fundWallet submitted! Hash: ${sent.hash}`);
        return sent.hash;
    }

    /**
     * Releases escrowed crypto to the buyer. MUST be signed by the platform arbiter
     * keypair (the contract now enforces arbiter auth, not seller auth).
     */
    async releaseCrypto(offerId: bigint, buyerWallet: string, signerKeypair: Keypair): Promise<string> {
        if (!isValidSorobanAddress(buyerWallet)) {
            throw new Error('[StellarContractClient] Invalid buyer wallet address.');
        }
        if (offerId <= 0n) {
            throw new Error('[StellarContractClient] offerId must be a positive number.');
        }

        const contract = new Contract(this.contractId);
        const accountInfo = await this.server.getAccount(signerKeypair.publicKey());
        const account = new Account(signerKeypair.publicKey(), accountInfo.sequenceNumber());

        let tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(contract.call(
                'release_crypto',
                nativeToScVal(offerId, { type: 'u64' }),
                nativeToScVal(buyerWallet, { type: 'address' }),
            ))
            .setTimeout(30)
            .build();

        const simulatedTx = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(simulatedTx)) {
            throw new Error(`[StellarContractClient] Simulation failed: ${JSON.stringify(simulatedTx)}`);
        }
        tx = rpc.assembleTransaction(tx, simulatedTx).build();
        tx.sign(signerKeypair);

        const sendResponse = await this.server.sendTransaction(tx);
        console.log(`[StellarContractClient] release_crypto submitted! Hash: ${sendResponse.hash}`);
        return sendResponse.hash;
    }
}
