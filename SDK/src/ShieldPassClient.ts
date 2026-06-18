import { ShieldPassProver } from './prover';
import { StellarContractClient } from './stellar';
import { ShieldPassConfig, PrivatePaymentParams, KYCProofParams, ShieldedNote } from './types';

export class ShieldPassClient {
    private prover: ShieldPassProver;
    private stellarClient: StellarContractClient;

    constructor(config: ShieldPassConfig) {
        this.prover = new ShieldPassProver(config.wasmPath);
        this.stellarClient = new StellarContractClient(config.rpcUrl, config.networkPassphrase, config.contractId);
    }

    /**
     * Initializes the client and loads the WASM/ZK backends.
     * Must be called before generating proofs.
     */
    async init() {
        await this.prover.init();
    }

    /**
     * Generates a reusable KYC compliance proof locally in the browser/node.
     * @param params User's private identity secrets and the public merkle root.
     * @returns A ZK Proof and the Compliance Nullifier.
     */
    async generateKYCProof(params: KYCProofParams) {
        console.log("Generating Zero-Knowledge KYC proof locally...");
        // This proof guarantees identity without revealing the underlying secrets.
        const proofData = await this.prover.proveKYC(params);
        return proofData;
    }

    /**
     * Generates a Shielded Payment Proof locally.
     * @param params Private note secrets, recipient, amount, and the compliance nullifier.
     * @returns A ZK Proof authorizing the private token transfer.
     */
    async generateShieldedPayment(params: PrivatePaymentParams) {
        console.log("Generating Zero-Knowledge private payment proof...");
        const proofData = await this.prover.proveShieldedTransfer(params);
        return proofData;
    }

    /**
     * Submits a generated Shielded Payment Proof to the Soroban smart contract.
     * @param proof The generated proof from `generateShieldedPayment`.
     * @param spendNullifier The nullifier to prevent double-spending.
     * @param recipient The destination address.
     * @param amount The token amount.
     */
    async executePrivatePayment(proof: Uint8Array, spendNullifier: string, recipient: string, amount: bigint) {
        console.log("Submitting private transaction to Stellar Soroban contract...");
        const txHash = await this.stellarClient.submitShieldedTransfer(proof, spendNullifier, recipient, amount);
        return txHash;
    }
}
