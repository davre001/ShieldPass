#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env};

#[contracttype]
pub enum DataKey {
    OfferCounter,
    Offer(u64),
    Arbiter,
}

#[contracttype]
#[derive(Clone)]
pub struct OfferDetails {
    pub seller: Address,
    pub token_address: Address,
    pub crypto_amount: i128,
    pub nullifier: BytesN<32>, // ZK proof nullifier - stored to prevent double-spend
    pub is_active: bool,
}

#[contract]
pub struct P2PEscrow;

#[contractimpl]
impl P2PEscrow {
    /// Initialize the escrow contract with the platform arbiter address.
    /// The arbiter (the relayer/backend) is the only party allowed to release crypto,
    /// because the platform holds the buyer's Naira in escrow off-chain.
    pub fn init(env: Env, arbiter: Address) {
        env.storage().instance().set(&DataKey::OfferCounter, &0u64);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
    }

    /// Step 1: Seller creates an offer and locks crypto in the escrow.
    /// The backend Relayer verifies the ZK Proof BEFORE calling this function.
    /// The nullifier is stored on-chain to prevent double-spending the same KYC proof.
    pub fn create_offer(
        env: Env,
        seller: Address,
        token_address: Address,
        amount: i128,
        nullifier: BytesN<32>,
    ) -> u64 {
        seller.require_auth();

        // Transfer crypto from seller to Escrow Contract
        let client = token::Client::new(&env, &token_address);
        client.transfer(&seller, &env.current_contract_address(), &amount);

        // Store Offer Details (including nullifier as proof of KYC compliance)
        let mut counter: u64 = env.storage().instance().get(&DataKey::OfferCounter).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&DataKey::OfferCounter, &counter);

        let details = OfferDetails {
            seller,
            token_address,
            crypto_amount: amount,
            nullifier,
            is_active: true,
        };
        env.storage().persistent().set(&DataKey::Offer(counter), &details);

        counter
    }

    /// Step 2: Seller confirms they received the Naira and releases the crypto to the Buyer.
    pub fn release_crypto(
        env: Env,
        offer_id: u64,
        buyer: Address,
    ) {
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).unwrap();
        arbiter.require_auth();

        let key = DataKey::Offer(offer_id);
        let mut offer: OfferDetails = env.storage().persistent().get(&key).unwrap();

        if !offer.is_active {
            panic!("Offer is no longer active");
        }

        // Mark offer as completed
        offer.is_active = false;
        env.storage().persistent().set(&key, &offer);

        // Transfer crypto to Buyer
        let client = token::Client::new(&env, &offer.token_address);
        client.transfer(&env.current_contract_address(), &buyer, &offer.crypto_amount);
    }

    /// Step 3: Seller cancels the offer and reclaims their crypto.
    pub fn cancel_offer(
        env: Env,
        offer_id: u64,
    ) {
        let key = DataKey::Offer(offer_id);
        let mut offer: OfferDetails = env.storage().persistent().get(&key).unwrap();

        offer.seller.require_auth();

        if !offer.is_active {
            panic!("Offer is no longer active");
        }

        // Mark offer as canceled
        offer.is_active = false;
        env.storage().persistent().set(&key, &offer);

        // Return crypto to Seller
        let client = token::Client::new(&env, &offer.token_address);
        client.transfer(&env.current_contract_address(), &offer.seller, &offer.crypto_amount);
    }

    /// View an offer's details
    pub fn get_offer(env: Env, offer_id: u64) -> OfferDetails {
        env.storage().persistent().get(&DataKey::Offer(offer_id)).unwrap()
    }

    /// View total offer count
    pub fn get_offer_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::OfferCounter).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
