#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, BytesN, Env};

fn setup_token<'a>(env: &Env, admin: &Address) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (addr.clone(), TokenClient::new(env, &addr), StellarAssetClient::new(env, &addr))
}

#[test]
fn test_get_swap_count() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, _token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&user, &1_000);

    let id = env.register(TrustlessSwap, ());
    let swap = TrustlessSwapClient::new(&env, &id);
    swap.init(&admin, &treasury);

    assert_eq!(swap.get_swap_count(), 0);

    let nullifier = BytesN::from_array(&env, &[1u8; 32]);
    swap.lock_swap(&user, &token_addr, &100, &nullifier);
    assert_eq!(swap.get_swap_count(), 1);
}

#[test]
fn test_lock_then_admin_claims_to_treasury() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&user, &1_000);

    let id = env.register(TrustlessSwap, ());
    let swap = TrustlessSwapClient::new(&env, &id);
    swap.init(&admin, &treasury);

    let nullifier = BytesN::from_array(&env, &[7u8; 32]);
    let swap_id = swap.lock_swap(&user, &token_addr, &600, &nullifier);
    assert_eq!(swap_id, 1);

    // Crypto is now locked in the contract, not with the user.
    assert_eq!(token.balance(&user), 400);
    assert_eq!(token.balance(&id), 600);

    // Admin claims after fiat payout -> crypto swept to treasury.
    swap.claim_swap(&admin, &swap_id);
    assert_eq!(token.balance(&treasury), 600);
    assert_eq!(token.balance(&id), 0);
}

#[test]
#[should_panic]
fn test_user_cannot_claim() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, _token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&user, &1_000);

    let id = env.register(TrustlessSwap, ());
    let swap = TrustlessSwapClient::new(&env, &id);

    env.mock_all_auths();
    swap.init(&admin, &treasury);
    let nullifier = BytesN::from_array(&env, &[7u8; 32]);
    let swap_id = swap.lock_swap(&user, &token_addr, &600, &nullifier);

    // Drop all authorizations: admin has not authorized, so claim must panic.
    env.set_auths(&[]);
    swap.claim_swap(&admin, &swap_id);
}

#[test]
fn test_refund_after_timeout() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&user, &1_000);

    let id = env.register(TrustlessSwap, ());
    let swap = TrustlessSwapClient::new(&env, &id);
    swap.init(&admin, &treasury);

    let nullifier = BytesN::from_array(&env, &[7u8; 32]);
    let swap_id = swap.lock_swap(&user, &token_addr, &600, &nullifier);
    assert_eq!(token.balance(&id), 600);

    // Fast-forward past the 1-hour time-lock.
    env.ledger().with_mut(|l| l.timestamp += TIMEOUT_SECONDS + 1);

    swap.refund_swap(&user, &swap_id);
    assert_eq!(token.balance(&user), 1_000);
    assert_eq!(token.balance(&id), 0);
}

#[test]
#[should_panic]
fn test_refund_before_timeout_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let (token_addr, _token, token_admin_client) = setup_token(&env, &token_admin);
    token_admin_client.mint(&user, &1_000);

    let id = env.register(TrustlessSwap, ());
    let swap = TrustlessSwapClient::new(&env, &id);
    swap.init(&admin, &treasury);

    let nullifier = BytesN::from_array(&env, &[7u8; 32]);
    let swap_id = swap.lock_swap(&user, &token_addr, &600, &nullifier);

    // No time has passed — refund must panic.
    swap.refund_swap(&user, &swap_id);
}
