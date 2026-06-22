// Poseidon (BN254) moved out of the Noir stdlib into the external `poseidon` lib
// as of Noir 1.0. hash_2 / hash_4 are the same permutation as the old std version.
use poseidon::poseidon::bn254;

global DEPTH: u32 = 8; // Depth of the Merkle Tree

fn merkle_membership(
    leaf: Field,
    path: [Field; DEPTH],
    indices: [Field; DEPTH]
) -> Field {
    let mut node = leaf;
    for i in 0..DEPTH {
        let is_right = indices[i];
        let (l, r) = if is_right == 1 {
            (path[i], node)
        } else {
            (node, path[i])
        };
        // Use Poseidon hash compatible with Stellar Protocol 25
        node = bn254::hash_2([l, r]);
    }
    node
}

fn main(
    secret_salt: Field,
    is_human: Field,
    bvn_verified: Field,
    good_standing: Field,
    merkle_path: [Field; DEPTH],
    merkle_indices: [Field; DEPTH],
    merkle_root: pub Field,
    current_timestamp: pub Field,
    nullifier: pub Field
) {
    // 1. Reconstruct the leaf commitment from private witnesses
    let leaf = bn254::hash_4([
        secret_salt, is_human, bvn_verified, good_standing
    ]);

    // 2. Prove this leaf is in the published tree
    let computed_root = merkle_membership(leaf, merkle_path, merkle_indices);
    assert(computed_root == merkle_root);

    // 3. Ensure compliance flags are true
    assert(is_human == 1);
    assert(bvn_verified == 1);
    assert(good_standing == 1);

    // 4. Generate the Compliance Nullifier (Reusable Pass bound to time)
    let computed_nullifier = bn254::hash_2([secret_salt, current_timestamp]);
    assert(computed_nullifier == nullifier);
}
