// @ts-ignore
import { buildPoseidon } from 'circomlibjs';

export class TrustedIssuer {
    private poseidon: any;

    async init() {
        // Initialize the Poseidon hash function used by Noir and Soroban
        this.poseidon = await buildPoseidon();
    }

    /**
     * Step 1: The Issuer checks the user's real-world ID (e.g. via Onfido)
     * If they pass, the Issuer hashes their status and their secret password into a Leaf.
     */
    generateLeaf(secretSalt: bigint, kycPassed: boolean, notSanctioned: boolean): string {
        const kycVal = kycPassed ? 1n : 0n;
        const sanctionVal = notSanctioned ? 1n : 0n;
        
        // Hash the three private inputs
        const hash = this.poseidon([secretSalt, kycVal, sanctionVal]);
        return this.poseidon.F.toString(hash);
    }

    /**
     * Step 2: The Issuer takes all approved users, builds a Merkle Tree, 
     * and publishes the Merkle Root to the Soroban Smart Contract.
     */
    generateMockMerkleTree(leaves: string[]): string {
        console.log(`[Issuer] Building Merkle Tree for ${leaves.length} compliant citizens...`);
        
        if (leaves.length === 0) return "0";

        let currentLevel = leaves.map(l => BigInt(l));
        
        // Simple binary tree hashing up to the root
        while (currentLevel.length > 1) {
            const nextLevel: bigint[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i+1] : left; // duplicate if odd
                const parentHash = this.poseidon([left, right]);
                nextLevel.push(parentHash);
            }
            currentLevel = nextLevel;
        }
        
        const root = this.poseidon.F.toString(currentLevel[0]);
        console.log(`[Issuer] Published New Compliance Root: ${root}`);
        return root;
    }
}
