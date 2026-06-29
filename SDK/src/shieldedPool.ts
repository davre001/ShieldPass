import {
    rpc, Contract, Keypair, TransactionBuilder, Account, BASE_FEE,
    nativeToScVal, scValToNative, xdr,
} from '@stellar/stellar-sdk';
import { SerializedProof } from './groth16Prover';
import { Signer } from './types';

const bytesScVal = (u8: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(u8));
const signalsScVal = (sigs: Uint8Array[]) => xdr.ScVal.scvVec(sigs.map(bytesScVal));

/**
 * Client for the trustless ShieldedPool Soroban contract (Groth16-verified).
 * ABI: init, deposit, faucet_seed, insert, confidential_swap, claim_swap,
 * refund_swap, current_root, next_index, get_payout.
 */
export class ShieldedPoolClient {
    private server: rpc.Server;
    constructor(
        rpcUrl: string,
        private networkPassphrase: string,
        private contractId: string,
    ) {
        if (!rpcUrl || !networkPassphrase || !contractId) {
            throw new Error('[ShieldedPoolClient] rpcUrl, networkPassphrase and contractId are required');
        }
        this.server = new rpc.Server(rpcUrl);
    }

    // ---- writes ----

    /** One-time setup: admin (relayer/treasury), pool token, and the Tier-2 threshold. */
    async init(admin: string, token: string, tier2Threshold: bigint, signer: Keypair): Promise<string> {
        return this.invokeKeypair(signer, 'init',
            nativeToScVal(admin, { type: 'address' }),
            nativeToScVal(token, { type: 'address' }),
            nativeToScVal(tier2Threshold, { type: 'i128' }),
        );
    }

    /** Escrow crypto into the pool and queue its note commitment. */
    async deposit(user: string, amount: bigint, noteCommitment: Uint8Array, signer: Signer): Promise<string> {
        return this.invoke(signer, 'deposit',
            nativeToScVal(user, { type: 'address' }),
            nativeToScVal(amount, { type: 'i128' }),
            bytesScVal(noteCommitment),
        );
    }

    /** Admin queues a note commitment funded from the pool (no public transfer). */
    async faucetSeed(noteCommitment: Uint8Array, admin: Keypair): Promise<string> {
        const hash = await this.invokeKeypair(admin, 'faucet_seed', bytesScVal(noteCommitment));
        // Wait for the tx to be committed before returning. The insert simulation
        // checks Pending(commitment) — if faucetSeed hasn't landed yet, insert panics.
        await this.waitForLanding(hash);
        return hash;
    }

    /** Poll until a tx hash is confirmed on-chain (or throw on failure/timeout). */
    async waitForLanding(hash: string, timeoutMs = 90_000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const r = await this.server.getTransaction(hash);
            if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) return;
            if (r.status === rpc.Api.GetTransactionStatus.FAILED)
                throw new Error(`[ShieldedPoolClient] tx ${hash} failed on-chain`);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        throw new Error(`[ShieldedPoolClient] tx ${hash} not confirmed within ${timeoutMs}ms`);
    }

    /** Trustless tree append: verifies a merkle_insert proof on-chain. */
    async insert(proof: SerializedProof, publicSignals: Uint8Array[], signer: Keypair): Promise<string> {
        return this.invokeKeypair(signer, 'insert',
            bytesScVal(proof.a), bytesScVal(proof.b), bytesScVal(proof.c), signalsScVal(publicSignals),
        );
    }

    /** Confidential swap: verifies the spend proof on-chain, returns the swap id. */
    async confidentialSwap(
        proof: SerializedProof, publicSignals: Uint8Array[], refundCommitment: Uint8Array, signer: Signer,
    ): Promise<{ hash: string; swapId: bigint }> {
        const hash = await this.invoke(signer, 'confidential_swap',
            bytesScVal(proof.a), bytesScVal(proof.b), bytesScVal(proof.c),
            signalsScVal(publicSignals), bytesScVal(refundCommitment),
        );
        return { hash, swapId: await this.decodeU64Return(hash) };
    }

    /** Unshield: spend a note and receive the crypto directly into `recipient`. */
    async unshield(
        proof: SerializedProof, publicSignals: Uint8Array[], recipient: string, signer: Signer,
    ): Promise<string> {
        return this.invoke(signer, 'unshield',
            bytesScVal(proof.a), bytesScVal(proof.b), bytesScVal(proof.c),
            signalsScVal(publicSignals), nativeToScVal(recipient, { type: 'address' }),
        );
    }

    /** V2 private transfer: spend a note, create recipient + change notes (no token movement). */
    async shieldedTransfer(proof: SerializedProof, publicSignals: Uint8Array[], signer: Signer): Promise<string> {
        return this.invoke(signer, 'shielded_transfer',
            bytesScVal(proof.a), bytesScVal(proof.b), bytesScVal(proof.c), signalsScVal(publicSignals));
    }

    /** Admin sweeps the swapped crypto to the treasury after the fiat payout settles. */
    async claimSwap(swapId: bigint, admin: Keypair): Promise<string> {
        return this.invokeKeypair(admin, 'claim_swap', nativeToScVal(swapId, { type: 'u64' }));
    }

    /** Trustless refund after the time-lock: requeues the user's pre-committed refund note. */
    async refundSwap(swapId: bigint, signer: Keypair): Promise<string> {
        return this.invokeKeypair(signer, 'refund_swap', nativeToScVal(swapId, { type: 'u64' }));
    }

    // ---- reads ----

    async currentRoot(): Promise<Uint8Array> {
        return new Uint8Array(await this.simRead('current_root'));
    }
    async nextIndex(): Promise<number> {
        return Number(await this.simRead('next_index'));
    }

    // ---- internals ----

    private async simRead(method: string): Promise<any> {
        const account = new Account(Keypair.random().publicKey(), '0');
        const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(new Contract(this.contractId).call(method)).setTimeout(30).build();
        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw new Error(`[ShieldedPoolClient] ${method} sim failed`);
        return scValToNative(sim.result.retval);
    }

    private async invokeKeypair(kp: Keypair, method: string, ...args: xdr.ScVal[]): Promise<string> {
        const info = await this.server.getAccount(kp.publicKey());
        const account = new Account(kp.publicKey(), info.sequenceNumber());
        let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(new Contract(this.contractId).call(method, ...args)).setTimeout(60).build();
        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`[ShieldedPoolClient] ${method} sim failed: ${JSON.stringify(sim)}`);
        tx = rpc.assembleTransaction(tx, sim).build();
        tx.sign(kp);
        const sent = await this.server.sendTransaction(tx);
        if (sent.status === 'ERROR') {
            const detail = (sent as any).errorResult ? JSON.stringify((sent as any).errorResult) : 'unknown';
            throw new Error(`[ShieldedPoolClient] sendTransaction rejected (${method}): ${detail}`);
        }
        if (sent.status === 'TRY_AGAIN_LATER') {
            throw new Error(`[ShieldedPoolClient] sendTransaction overloaded (${method}) — retry`);
        }
        return sent.hash;
    }

    /** keypair (backend) or passkey (browser smart wallet) signing. */
    private async invoke(signer: Signer, method: string, ...args: xdr.ScVal[]): Promise<string> {
        if (signer.kind === 'keypair') return this.invokeKeypair(signer.keypair, method, ...args);
        const account = new Account(Keypair.random().publicKey(), '0');
        let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
            .addOperation(new Contract(this.contractId).call(method, ...args)).setTimeout(30).build();
        const sim = await this.server.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`[ShieldedPoolClient] ${method} sim failed: ${JSON.stringify(sim)}`);
        tx = rpc.assembleTransaction(tx, sim).build();
        const signedXdr = await signer.sign(tx.toXDR());
        return signer.submit(signedXdr);
    }

    private async decodeU64Return(hash: string): Promise<bigint> {
        for (let i = 0; i < 20; i++) {
            const r = await this.server.getTransaction(hash);
            if (r.status === rpc.Api.GetTransactionStatus.SUCCESS && r.returnValue) {
                return BigInt(scValToNative(r.returnValue) as number | bigint);
            }
            if (r.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error('[ShieldedPoolClient] tx failed.');
            await new Promise((res) => setTimeout(res, 1000));
        }
        throw new Error('[ShieldedPoolClient] result not available (timed out).');
    }
}
