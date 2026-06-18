#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, Symbol};

#[contracttype]
pub enum DataKey {
    ComplianceRegistry,
    OfferCounter,
    Offer(u64),
}

#[contracttype]
#[derive(Clone)]
pub struct OfferDetails {
    pub seller: Address,
    pub token_address: Address,
    pub crypto_amount: i128,
    pub is_active: bool,
}

#[contract]
pub struct P2PEscrow;

#[contractimpl]
impl P2PEscrow {
    /// Initialize with the trusted Compliance Registry
    pub fn init(env: Env, registry_address: Address) {
        env.storage().instance().set(&DataKey::ComplianceRegistry, &registry_address);
        env.storage().instance().set(&DataKey::OfferCounter, &0u64);
    }

    /// Step 1: Seller creates an offer and locks crypto in the escrow.
    /// Requires ZK verification via the compliance registry.
    pub fn create_offer(
        env: Env,
        seller: Address,
        token_address: Address,
        amount: i128,
        nullifier: BytesN<32>,
    ) -> u64 {
        seller.require_auth();

        // 1. Check Compliance (ZK Proof verified by Relayer previously)
        let registry_address: Address = env.storage().instance().get(&DataKey::ComplianceRegistry).unwrap();
        let verified: bool = env.invoke_contract(
            &registry_address,
            &Symbol::new(&env, "is_verified"),
            soroban_sdk::vec![&env, nullifier.into()],
        );
        if !verified {
            panic!("Seller is not verified (ZK Proof missing or invalid)");
        }

        // 2. Transfer crypto to Escrow Contract
        let client = token::Client::new(&env, &token_address);
        client.transfer(&seller, &env.current_contract_address(), &amount);

        // 3. Store Offer Details
        let mut counter: u64 = env.storage().instance().get(&DataKey::OfferCounter).unwrap();
        counter += 1;
        env.storage().instance().set(&DataKey::OfferCounter, &counter);

        let details = OfferDetails {
            seller,
            token_address,
            crypto_amount: amount,
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
        let key = DataKey::Offer(offer_id);
        let mut offer: OfferDetails = env.storage().persistent().get(&key).unwrap();
        
        offer.seller.require_auth();

        if !offer.is_active {
            panic!("Offer is no longer active");
        }

        // 1. Mark offer as completed
        offer.is_active = false;
        env.storage().persistent().set(&key, &offer);

        // 2. Transfer crypto to Buyer
        let client = token::Client::new(&env, &offer.token_address);
        client.transfer(&env.current_contract_address(), &buyer, &offer.crypto_amount);
    }

    /// Step 3: Seller cancels the offer and reclaims their crypto (only if not currently locked in a trade)
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

        // 1. Mark offer as canceled
        offer.is_active = false;
        env.storage().persistent().set(&key, &offer);

        // 2. Return crypto to Seller
        let client = token::Client::new(&env, &offer.token_address);
        client.transfer(&env.current_contract_address(), &offer.seller, &offer.crypto_amount);
    }
}

#[cfg(test)]
mod test;
