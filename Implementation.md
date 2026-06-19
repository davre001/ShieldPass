# ShieldPass — Full Build Plan (Nigerian P2P Edition)
**Private, ZK-Powered P2P Exchange for the Nigerian Market on Stellar**
12-day hackathon build plan: architecture, ZK circuits, smart contracts, backend, database, frontend, integrations, and day-by-day timeline.

---

## 0. The one architecture decision that determines everything else

Before anything else: how does the ZK proof actually get verified?

**Path B — Hybrid attestation model (recommended default).** Proof generation happens fully client-side in the browser (so private data never leaves the user's device — this is the actual privacy guarantee). A lightweight relayer/verifier service checks the proof using the same proving backend's JS verifier, and if valid, submits a transaction to a Soroban contract that simply records "nullifier X has been verified" as an immutable on-chain fact.

Everything below assumes Path B as the default.

---

## 1. MVP Scope — what you're actually building in 12 days

**Core flow:** A user proves three things about themselves — passed Liveness Check, valid Nigerian Resident (BVN linked), and not flagged for scams — without revealing identity, name, or BVN. A P2P escrow trade only initiates on Stellar once that proof is verified.

**What's real:**
- Real Stellar testnet accounts, real Soroban escrow contracts, real on-chain locking/release of assets (USDC, XLM, NGNC).
- Real Noir circuit, real client-side proof generation, real cryptographic verification.
- Real Merkle tree of attestation commitments.

**What's mocked (and you should say so openly in your demo):**
- The BVN provider — you'll build a simple form that takes a 10-digit number and auto-approves, standing in for Paystack/Mono identity APIs.
- Dispute Resolution — For the hackathon, we assume the seller releases crypto honestly once they see the fiat payment. Complex admin dispute panels are skipped.

---

## 2. System Architecture

```
┌─────────────────┐      ┌──────────────────────┐
│   FRONTEND       │      │  Stellar Wallet       │
│   React + Vite   │◄────►│  (Freighter)          │
│   bb.js (in-     │      └──────────────────────┘
│   browser prover)│
└────────┬─────────┘
         │ REST/JSON
         ▼
┌──────────────────────────────────────────────┐
│              BACKEND API                      │
│   Node.js + Express/Fastify + TypeScript       │
│                                                 │
│  ┌────────────┐  ┌───────────────┐  ┌───────┐ │
│  │ Auth /      │  │ Compliance     │  │ Proof │ │
│  │ User mgmt   │  │ Issuer Service │  │ Relayer│ │
│  └────────────┘  └───────┬───────┘  └───┬───┘ │
└────────────────────────────┼──────────────┼────┘
                              │              │
                    ┌─────────▼──────┐  ┌────▼─────────────┐
                    │  PostgreSQL     │  │ Stellar RPC /     │
                    │  (Prisma ORM)   │  │ Horizon           │
                    └─────────────────┘  └────────┬──────────┘
                                                    │
                                          ┌─────────▼──────────────┐
                                          │  Soroban Contracts       │
                                          │  - compliance_registry   │
                                          │  - p2p_escrow            │
                                          └──────────────────────────┘
```

**Sequence — full user journey:**
1. User connects Stellar wallet.
2. User completes mock BVN onboarding → backend Issuer Service computes attribute flags (`is_human`, `bvn_verified`, `good_standing`).
3. Issuer Service computes a Poseidon-hash commitment of these flags + `secret_salt`, inserts it as a leaf into an off-chain Merkle tree, and returns the commitment + Merkle path + `secret_salt` to the user.
4. Issuer Service periodically publishes the current Merkle root on-chain via `compliance_registry.publish_root()`.
5. User enters the P2P Marketplace and clicks "Accept Offer".
6. Frontend generates a ZK proof **in the browser** using the stored `secret_salt` + Merkle path, proving membership + flags.
7. Relayer verifies the proof, and if valid, submits `record_verified_nullifier()` to the Soroban contract.
8. `p2p_escrow` contract allows the user to lock crypto or start a fiat trade.
9. Buyer sends Naira via traditional bank transfer. Seller confirms receipt and calls `release_crypto()` on the contract.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind |
| Wallet | Freighter / Stellar Wallets Kit |
| ZK circuit | Noir (`nargo`) |
| Proving backend | Barretenberg (`bb.js`) |
| Smart contracts | Rust + `soroban-sdk` |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL + Prisma ORM |

---

## 4. ZK Circuit Design (Noir)

**Design principle:** Keep the circuit small.

**Private inputs:** `secret_salt`, `is_human`, `bvn_verified`, `good_standing`, `merkle_path[DEPTH]`, `merkle_path_indices[DEPTH]`
**Public inputs:** `merkle_root`, `current_timestamp`, `nullifier`

```rust
// circuits/kyc_proof/src/main.nr
use dep::std;

global DEPTH: u32 = 8; 

fn main(
    secret_salt: Field,
    is_human: Field,
    bvn_verified: Field,
    good_standing: Field,
    merkle_path: [Field; DEPTH],
    merkle_path_indices: [Field; DEPTH],
    merkle_root: pub Field,
    current_timestamp: pub Field,
    nullifier: pub Field
) {
    let leaf = std::hash::poseidon::bn254::hash_4([
        secret_salt, is_human, bvn_verified, good_standing
    ]);

    let computed_root = std::merkle::compute_merkle_root(leaf, merkle_path_indices, merkle_path);
    assert(computed_root == merkle_root);

    assert(is_human == 1);
    assert(bvn_verified == 1);
    assert(good_standing == 1);

    let computed_nullifier = std::hash::poseidon::bn254::hash_2([secret_salt, current_timestamp]);
    assert(computed_nullifier == nullifier);
}
```

---

## 5. Compliance Issuer Service (backend module)

1. Accept mock BVN submission.
2. Set `is_human = 1`, `bvn_verified = 1`, `good_standing = 1`.
3. Generate fresh `secret_salt`.
4. Compute leaf commitment, insert into Merkle tree.
5. Return `{secret_salt, merkle_path}` to client. DO NOT store salt server-side.

---

## 6. Soroban Smart Contracts (Rust)

### 6.1 `compliance_registry`
Stores the current Merkle root and the set of nullifiers that have been verified. (Same logic as original plan).

### 6.2 `p2p_escrow`
Handles locking and releasing assets.

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, Symbol};

#[contract]
pub struct P2PEscrow;

#[contractimpl]
impl P2PEscrow {
    // Seller locks crypto to create an offer
    pub fn create_offer(
        env: Env,
        registry_contract: Address,
        seller: Address,
        token_contract: Address,
        amount: i128,
        nullifier: BytesN<32>,
    ) {
        seller.require_auth();
        // Verify nullifier via registry to ensure seller is KYC'd
        let verified: bool = env.invoke_contract(
            &registry_contract,
            &Symbol::new(&env, "is_verified"),
            soroban_sdk::vec![&env, nullifier.into()],
        );
        if !verified { panic!("seller not verified"); }
        
        // Transfer crypto from seller to this escrow contract
        let token_client = token::Client::new(&env, &token_contract);
        token_client.transfer(&seller, &env.current_contract_address(), &amount);
        // ... store offer details ...
    }

    // Seller calls this after receiving Naira
    pub fn release_crypto(env: Env, seller: Address, buyer: Address, token_contract: Address, amount: i128) {
        seller.require_auth();
        // ... logic to verify offer exists ...
        let token_client = token::Client::new(&env, &token_contract);
        token_client.transfer(&env.current_contract_address(), &buyer, &amount);
    }
}
```

---

## 7. Backend API Design

| Method | Path | Purpose |
|---|---|---|
| POST | `/kyc/submit-bvn` | Submit mock BVN form |
| POST | `/compliance/issue-attestation` | Compute flags, insert Merkle leaf, return salt |
| GET | `/compliance/root` | Return current published Merkle root |
| POST | `/verify/submit-proof` | Relayer endpoint: verify proof |
| POST | `/p2p/offers` | Create/list P2P offers (fiat amounts, rates) |
| POST | `/p2p/offers/:id/accept` | Buyer indicates intent to pay fiat |

---

## 8. Database Schema (Prisma)

Update models to include `P2POffer`:

```prisma
model P2POffer {
  id              String   @id @default(uuid())
  sellerId        String
  assetType       String   // e.g. USDC, XLM, NGNC
  cryptoAmount    String
  nairaRate       String
  status          String   @default("open") // open | locked | completed
  createdAt       DateTime @default(now())
}
```

---

## 9. Frontend Design

**Pages Needed:**
1. **Landing Page:** "The first private, scam-free P2P for Nigeria."
2. **Onboarding:** Mock BVN entry screen.
3. **P2P Marketplace (Order Book):** List of available offers.
4. **Trade Room:** Escrow screen showing bank details and "Release Crypto" button.
5. **Dashboard:** Active balances and trade history.

---

## 10. Demo Script (3 minutes)

1. **Story:** "Emeka in Lagos wants to sell his USDC for Naira. He wants a safe P2P experience but doesn't want his real identity tied to his crypto wallet publicly."
2. **Live:** Walk through the BVN onboarding, then show the P2P marketplace. Emeka locks crypto.
3. **On-chain proof:** Show the transaction on Stellar Expert. Point out the event only contains a nullifier hash, never PII.
4. **Close:** "ShieldPass provides the safety of KYC without the privacy invasion, unlocking safe P2P markets in Nigeria."
