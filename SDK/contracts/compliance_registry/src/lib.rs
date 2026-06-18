#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

#[contracttype]
pub enum DataKey {
    Admin,
    MerkleRoot,
}

#[contract]
pub struct ComplianceRegistry;

#[contractimpl]
impl ComplianceRegistry {
    /// Initializes the registry with a trusted admin (the KYC Issuer or a Multi-Sig DAO)
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Admin securely updates the Merkle Root of all valid Compliance Nullifiers
    pub fn update_root(env: Env, new_root: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::MerkleRoot, &new_root);
    }

    /// Public getter for the Shielded Pool to read the current valid root
    pub fn get_root(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::MerkleRoot).unwrap_or(BytesN::from_array(&env, &[0; 32]))
    }
}
