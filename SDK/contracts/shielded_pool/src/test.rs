#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, BytesN, Env};

fn setup_token<'a>(env: &Env, admin: &Address) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (addr.clone(), TokenClient::new(env, &addr), StellarAssetClient::new(env, &addr))
}

#[test]
fn test_get_offer_count() {
    let env = Env::default();
    env.mock_all_auths();

    let arbiter = Address::generate(&env);
    let seller = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, _token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&seller, &1_000);

    let escrow_id = env.register(P2PEscrow, ());
    let escrow = P2PEscrowClient::new(&env, &escrow_id);
    escrow.init(&arbiter);

    assert_eq!(escrow.get_offer_count(), 0);

    let nullifier = BytesN::from_array(&env, &[1u8; 32]);
    escrow.create_offer(&seller, &token_addr, &100, &nullifier);
    assert_eq!(escrow.get_offer_count(), 1);
}

#[test]
fn test_create_then_arbiter_releases_to_buyer() {
    let env = Env::default();
    env.mock_all_auths();

    let arbiter = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&seller, &1_000);

    let escrow_id = env.register(P2PEscrow, ());
    let escrow = P2PEscrowClient::new(&env, &escrow_id);
    escrow.init(&arbiter);

    let nullifier = BytesN::from_array(&env, &[7u8; 32]);
    let offer_id = escrow.create_offer(&seller, &token_addr, &600, &nullifier);
    assert_eq!(offer_id, 1);

    // Crypto is now locked in the contract, not with the seller.
    assert_eq!(token.balance(&seller), 400);
    assert_eq!(token.balance(&escrow_id), 600);

    // Arbiter releases to the buyer.
    escrow.release_crypto(&offer_id, &buyer);
    assert_eq!(token.balance(&buyer), 600);
    assert_eq!(token.balance(&escrow_id), 0);
    assert!(!escrow.get_offer(&offer_id).is_active);
}

#[test]
#[should_panic]
fn test_seller_cannot_release() {
    let env = Env::default();

    let arbiter = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, _token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&seller, &1_000);

    let escrow_id = env.register(P2PEscrow, ());
    let escrow = P2PEscrowClient::new(&env, &escrow_id);

    // Authorize only what the happy path needs (init + create_offer), NOT the release.
    env.mock_all_auths();
    escrow.init(&arbiter);
    let nullifier = BytesN::from_array(&env, &[7u8; 32]);
    let offer_id = escrow.create_offer(&seller, &token_addr, &600, &nullifier);

    // Drop all authorizations: the arbiter has not authorized, so release must panic.
    env.set_auths(&[]);
    escrow.release_crypto(&offer_id, &buyer);
}
