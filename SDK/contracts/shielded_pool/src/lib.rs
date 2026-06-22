#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env};

#[contracttype]
pub enum DataKey {
    Admin,
    SwapCounter,
    Swap(u64),
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum SwapStatus {
    Locked,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone)]
pub struct SwapDetails {
    pub user: Address,
    pub token_address: Address,
    pub amount: i128,
    pub nullifier: BytesN<32>, // ZK proof nullifier
    pub locked_at: u64,
    pub status: SwapStatus,
}

#[contract]
pub struct TrustlessSwap;

#[contractimpl]
impl TrustlessSwap {
    /// Initialize the contract with the platform admin (treasury/relayer) address.
    pub fn init(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::SwapCounter, &0u64);
    }

    /// Step 1: User locks their crypto in the contract.
    /// This triggers the backend to verify the ZK Proof and send the Lenco fiat payout.
    pub fn lock_swap(
        env: Env,
        user: Address,
        token_address: Address,
        amount: i128,
        nullifier: BytesN<32>,
    ) -> u64 {
        user.require_auth();

        // Transfer crypto from user to this contract
        let client = token::Client::new(&env, &token_address);
        client.transfer(&user, &env.current_contract_address(), &amount);

        // Store Swap Details
        let mut counter: u64 = env.storage().instance().get(&DataKey::SwapCounter).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&DataKey::SwapCounter, &counter);

        let details = SwapDetails {
            user,
            token_address,
            amount,
            nullifier,
            locked_at: env.ledger().timestamp(),
            status: SwapStatus::Locked,
        };
        env.storage().persistent().set(&DataKey::Swap(counter), &details);

        counter
    }

    /// Step 2: Backend calls this ONLY AFTER the Lenco fiat payout succeeds.
    /// It transfers the crypto to the ShieldPass treasury.
    pub fn claim_swap(env: Env, swap_id: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let key = DataKey::Swap(swap_id);
        let mut swap: SwapDetails = env.storage().persistent().get(&key).unwrap();

        if swap.status != SwapStatus::Locked {
            panic!("Swap is not locked");
        }

        swap.status = SwapStatus::Completed;
        env.storage().persistent().set(&key, &swap);

        // Transfer crypto to Treasury
        let client = token::Client::new(&env, &swap.token_address);
        client.transfer(&env.current_contract_address(), &admin, &swap.amount);
    }

    /// Fallback: If the backend fails to pay the fiat within 1 hour,
    /// the user can call this to retrieve their crypto trustlessly.
    pub fn refund_swap(env: Env, swap_id: u64) {
        let key = DataKey::Swap(swap_id);
        let mut swap: SwapDetails = env.storage().persistent().get(&key).unwrap();

        swap.user.require_auth();

        if swap.status != SwapStatus::Locked {
            panic!("Swap is not locked");
        }

        // Check time-lock: 1 hour (3600 seconds)
        if env.ledger().timestamp() < swap.locked_at + 3600 {
            panic!("Time-lock has not expired yet");
        }

        swap.status = SwapStatus::Refunded;
        env.storage().persistent().set(&key, &swap);

        // Return crypto to User
        let client = token::Client::new(&env, &swap.token_address);
        client.transfer(&env.current_contract_address(), &swap.user, &swap.amount);
    }

    /// View a swap's details
    pub fn get_swap(env: Env, swap_id: u64) -> SwapDetails {
        env.storage().persistent().get(&DataKey::Swap(swap_id)).unwrap()
    }
}
