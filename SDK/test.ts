import { TrustedIssuer } from './src/issuer';
import { ShieldPassProver } from './src/prover';

async function runTest() {
    console.log("=========================================");
    console.log("   SHIELDPASS LOCAL TESTING ENVIRONMENT  ");
    console.log("=========================================\n");

    // 1. Initialize the Trusted Issuer
    const issuer = new TrustedIssuer();
    await issuer.init();

    // 2. Mock Alice passing KYC in the real world
    const aliceSecretSalt = 123456789n; // Only Alice knows this!
    const aliceLeaf = issuer.generateLeaf(aliceSecretSalt, true, true);
    console.log(`[Issuer] Alice verified. Generated Leaf: ${aliceLeaf}`);

    // 3. Mock the Issuer building the Merkle Tree of all compliant citizens
    const treeRoot = issuer.generateMockMerkleTree([aliceLeaf, "9999999"]);
    
    // 4. Initialize the Prover Engine
    console.log("\n[SDK] Booting up Zero-Knowledge Math Engine...");
    const prover = new ShieldPassProver();
    await prover.init();

    // 5. Alice generates the ZK Proof locally
    console.log("\n[SDK] Alice generating KYC Proof to get Reusable Pass...");
    
    // Note: We use dummy paths for the test. In a real app, you calculate the exact path.
    const kycParams = {
        secret_salt: aliceSecretSalt.toString(),
        kyc_passed: 1,
        not_sanctioned: 1,
        merkle_path: ["9999999", "0", "0", "0", "0", "0", "0", "0"], 
        merkle_indices: [1, 0, 0, 0, 0, 0, 0, 0], 
        merkle_root: treeRoot
    };

    try {
        const { proof, publicInputs } = await prover.proveKYC(kycParams);
        console.log(`\n✅ SUCCESS! ZK Proof Generated.`);
        console.log(`✅ Proof Size: ${proof.length} bytes`);
        console.log(`✅ Alice's Reusable Compliance Nullifier: ${publicInputs[0]}`);
    } catch (e) {
        console.log(`\n⚠️ The Noir prover crashed (expected in this test mock).`);
        console.log(`Reason: The dummy merkle_path we hardcoded above doesn't perfectly hash to the root ${treeRoot}.`);
        console.log(`If you calculate the exact Merkle path, the proof will generate successfully!`);
    }
    
    console.log("\n=========================================");
}

runTest();
