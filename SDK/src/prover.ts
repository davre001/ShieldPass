import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
// We assume these JSON files are generated when the user runs `nargo compile`
import kycCircuit from '../circuits/reusable_kyc/target/reusable_kyc.json';
import transferCircuit from '../circuits/shielded_transfer/target/shielded_transfer.json';

export class ShieldPassProver {
    private kycNoir: Noir | null = null;
    private transferNoir: Noir | null = null;
    private backend: BarretenbergBackend | null = null;

    async init() {
        console.log("Initializing Barretenberg WASM backend and Noir JS...");
        
        // 1. Initialize the backend engine
        this.backend = new BarretenbergBackend(kycCircuit as any);
        
        // 2. Initialize the circuit wrappers
        this.kycNoir = new Noir(kycCircuit as any);
        this.transferNoir = new Noir(transferCircuit as any);
    }

    async proveKYC(params: any): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
        if (!this.kycNoir || !this.backend) throw new Error("Prover not initialized");
        
        console.log("Generating witness for reusable KYC locally...");
        // This is where the magic happens: user's secrets stay local.
        const { witness } = await this.kycNoir.execute(params);
        
        console.log("Generating Groth16/Plonk Proof...");
        const proofData = await this.backend.generateProof(witness);
        
        return {
            proof: proofData.proof,
            publicInputs: proofData.publicInputs
        };
    }

    async proveShieldedTransfer(params: any): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
        if (!this.transferNoir || !this.backend) throw new Error("Prover not initialized");
        
        console.log("Generating witness for shielded transfer locally...");
        const { witness } = await this.transferNoir.execute(params);
        
        console.log("Generating Groth16/Plonk Proof...");
        const proofData = await this.backend.generateProof(witness);
        
        return {
            proof: proofData.proof,
            publicInputs: proofData.publicInputs
        };
    }
}
