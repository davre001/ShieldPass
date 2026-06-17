# ShieldPass — Full Build Plan
**Private Compliance for Cross-Border Payments on Stellar**
12-day hackathon build plan: architecture, ZK circuits, smart contracts, backend, database, frontend, integrations, and day-by-day timeline.

---

## 0. The one architecture decision that determines everything else

Before anything else: how does the ZK proof actually get verified?

There are two paths.

**Path A — Native on-chain verification.** The Noir proof is verified directly inside a Soroban contract using Stellar's native BLS12-381 pairing host functions. This is the "purest" version of the idea and matches a real Stellar Development Foundation initiative (a project called Interstellar, building a Noir→BLS12-381→Soroban verifier pipeline). It's compelling to judges because it's genuinely cutting-edge — but as of now this tooling is an early proposal, not a polished SDK you can `npm install`. Attempting this from scratch in 12 days is high risk.

**Path B — Hybrid attestation model (recommended default).** Proof generation happens fully client-side in the browser (so private data never leaves the user's device — this is the actual privacy guarantee). A lightweight relayer/verifier service checks the proof using the same proving backend's JS verifier, and if valid, submits a transaction to a Soroban contract that simply records "nullifier X has been verified" as an immutable on-chain fact. The trust assumption (you trust the relayer's verification logic, which is open-source and auditable) is the same pattern used by several production identity systems, and it's completely honest to disclose to judges.

**Recommendation:** Build Path B as your real submission. Keep Path A as a stretch goal for days 11–12 if you're ahead of schedule, and mention it explicitly in your pitch as "the next step once Stellar's native ZK verifier tooling matures" — judges respond well to teams that understand the frontier rather than oversell what's actually running.

Everything below assumes Path B as the default, with Path A called out wherever it diverges.

---

## 1. MVP Scope — what you're actually building in 12 days

**Core flow:** A user proves four things about themselves — passed KYC, not on a sanctions list, country eligible, age 18+ — without revealing identity, documents, or even *which* of those facts is which. A payment only releases on Stellar once that proof is verified.

**What's real:**
- Real Stellar testnet accounts, real Soroban contracts, real on-chain transactions
- Real Noir circuit, real client-side proof generation, real cryptographic verification
- Real Merkle tree of attestation commitments

**What's mocked (and you should say so openly in your demo):**
- The KYC provider — you'll build a simple form + fake document upload that auto-approves, standing in for Persona/Sumsub/Veriff
- The sanctions list check — use a small real public OFAC SDN sample for realism, but check against it yourself rather than calling a paid API
- Identity documents — never store real personal data; everything is clearly test data

This mocking is normal and expected at this hackathon — the ZK circuit and on-chain verification logic are the actual deliverable, not the KYC integration.

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
                                          │  - payment_gateway       │
                                          └──────────────────────────┘
```

**Sequence — full user journey:**
1. User connects Stellar wallet (Freighter) on frontend
2. User completes mock KYC form → backend Compliance Issuer Service checks mock sanctions list, computes attribute flags
3. Issuer Service computes a Poseidon-hash commitment of (secret_salt, kyc_passed, sanctions_clear, country_eligible, age_over_18, expiry), inserts it as a leaf into an off-chain Merkle tree, and returns the commitment + Merkle path + secret_salt to the user (secret_salt never touches the server again after this point — store it client-side only)
4. Issuer Service periodically publishes the current Merkle root on-chain via `compliance_registry.publish_root()`
5. When the user wants to send/receive a payment, the frontend generates a ZK proof **in the browser** using the stored secret_salt + Merkle path, proving membership + all four flags = 1, without sending any of that to a server
6. Frontend sends only the proof + public inputs (root, nullifier, timestamp) to the Proof Relayer
7. Relayer verifies the proof using the JS verifier library, and if valid, submits `record_verified_nullifier()` to the Soroban contract
8. `payment_gateway` contract checks `is_verified(nullifier)` is true, then executes the actual Stellar asset transfer
9. Frontend polls for transaction status and shows confirmation

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Fast to scaffold, judges expect it |
| Wallet | Freighter / Stellar Wallets Kit | Standard Stellar wallet connector |
| ZK circuit | Noir (`nargo`) | DSL for ZK, compiles to ACIR |
| Proving backend | Barretenberg (`bb.js`) | Default Noir backend, runs in-browser via WASM, generates UltraHonk/PLONK proofs |
| Smart contracts | Rust + `soroban-sdk` (current crate name; CLI tool is now `stellar`, not `soroban`) | Compiled to `wasm32v1-none` target |
| Backend | Node.js + TypeScript + Express (or Fastify) | |
| Database | PostgreSQL + Prisma ORM | |
| Blockchain access | Stellar SDK (JS) + Soroban RPC + Horizon | |
| Auth | Wallet-signature challenge + JWT session | No passwords |
| Hosting (hackathon) | Frontend: Vercel · Backend+DB: Railway/Render · Contracts: Stellar testnet | |

Install checklist before Day 1:
```bash
# Rust + Stellar CLI
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
cargo install --locked stellar-cli

# Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup
# bb (Barretenberg CLI, for native proving/testing outside browser)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup

# Node + project scaffolding
npm create vite@latest shieldpass-frontend -- --template react-ts
npm init -y # backend
```

---

## 4. ZK Circuit Design (Noir)

**Design principle:** push as much logic as possible into the trusted issuer (off-chain), keep the circuit small. The issuer already did the real-world KYC/sanctions/age/country checks — the circuit's only job is to prove "I hold a valid, unrevoked attestation saying all four checks passed" without revealing which attestation or any underlying data.

**Private inputs:** `secret_salt`, `kyc_passed`, `sanctions_clear`, `country_eligible`, `age_over_18`, `expiry_timestamp`, `merkle_path[DEPTH]`, `merkle_path_indices[DEPTH]`

**Public inputs:** `merkle_root`, `current_timestamp`, `nullifier`

```rust
// circuits/kyc_proof/src/main.nr
use dep::std;

global DEPTH: u32 = 8; // 256 leaves — plenty for a hackathon demo, raise later

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
        node = std::hash::poseidon::bn254::hash_2([l, r]);
    }
    node
}

fn main(
    secret_salt: Field,
    kyc_passed: Field,
    sanctions_clear: Field,
    country_eligible: Field,
    age_over_18: Field,
    expiry_timestamp: Field,
    merkle_path: [Field; DEPTH],
    merkle_path_indices: [Field; DEPTH],
    merkle_root: pub Field,
    current_timestamp: pub Field,
    nullifier: pub Field
) {
    // 1. Reconstruct the leaf commitment from private witnesses
    let leaf = std::hash::poseidon::bn254::hash_6([
        secret_salt, kyc_passed, sanctions_clear,
        country_eligible, age_over_18, expiry_timestamp
    ]);

    // 2. Prove this leaf is in the published tree
    let computed_root = merkle_membership(leaf, merkle_path, merkle_path_indices);
    assert(computed_root == merkle_root);

    // 3. All four compliance flags must be true
    assert(kyc_passed == 1);
    assert(sanctions_clear == 1);
    assert(country_eligible == 1);
    assert(age_over_18 == 1);

    // 4. Attestation must not be expired
    assert(expiry_timestamp as u64 > current_timestamp as u64);

    // 5. Nullifier prevents the same attestation from being reused
    //    in a way that links transactions together
    let computed_nullifier = std::hash::poseidon::bn254::hash_2([secret_salt, current_timestamp]);
    assert(computed_nullifier == nullifier);
}
```

This is a structural skeleton — Noir's exact stdlib signatures shift between versions, so check `noir-lang.org/docs` against whatever version `noirup` installs and adjust hash arities if needed. Treat this as the logic to implement, not copy-paste-ready code.

**Why this design is hackathon-feasible:** the circuit never touches a date of birth, country code, name, or document — it only ever sees four bits and a salt. That's a genuinely strong, demo-able privacy story, and it keeps proving time low (sub-second to a few seconds in-browser with `bb.js` for a depth-8 tree).

Test with:
```bash
cd circuits/kyc_proof
nargo check
nargo test
nargo execute
bb prove -b ./target/kyc_proof.json -w ./target/witness.gz -o ./proof
```

---

## 5. Compliance Issuer Service (backend module — your "mock KYC provider")

This is the trusted off-chain authority. It's a normal backend module, not a smart contract.

**Responsibilities:**
1. Accept mock KYC submission (name, DOB, country, fake document upload)
2. Check DOB → `age_over_18` flag
3. Check country against an eligible-country allowlist → `country_eligible` flag
4. Check name/details against a small real OFAC SDN sample CSV → `sanctions_clear` flag
5. Set `kyc_passed = 1` if document upload step completed (auto-approve in mock mode)
6. Generate a fresh `secret_salt` (random Field element)
7. Compute the leaf commitment, insert into the off-chain Merkle tree (use a JS Poseidon implementation matching the one in the Noir circuit — e.g. `circomlibjs` poseidon or `@noir-lang`'s own poseidon binding, must match exactly)
8. Return `{secret_salt, merkle_path, merkle_path_indices, leaf_index}` to the user — and never log or persist `secret_salt` after the response is sent
9. On a schedule (or on every N new attestations), publish the new Merkle root on-chain via the `compliance_registry` contract

**Merkle tree implementation note:** keep this in-memory or in a simple table in Postgres (leaves indexed by insertion order), rebuild the tree on issuer service startup from the DB. For a hackathon, a depth-8 (256-leaf) tree is enough — don't over-engineer this.

---

## 6. Soroban Smart Contracts (Rust)

Two contracts.

### 6.1 `compliance_registry`

Stores the current Merkle root (published by the trusted issuer) and the set of nullifiers that have been verified, to prevent replay.

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

#[contracttype]
pub enum DataKey {
    MerkleRoot,
    Issuer,
    Relayer,
    Nullifier(BytesN<32>),
}

#[contract]
pub struct ComplianceRegistry;

#[contractimpl]
impl ComplianceRegistry {
    pub fn init(env: Env, issuer: Address, relayer: Address) {
        env.storage().instance().set(&DataKey::Issuer, &issuer);
        env.storage().instance().set(&DataKey::Relayer, &relayer);
    }

    pub fn publish_root(env: Env, issuer: Address, root: BytesN<32>) {
        issuer.require_auth();
        let stored: Address = env.storage().instance().get(&DataKey::Issuer).unwrap();
        if issuer != stored {
            panic!("unauthorized issuer");
        }
        env.storage().instance().set(&DataKey::MerkleRoot, &root);
    }

    pub fn get_root(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::MerkleRoot).unwrap()
    }

    // Called only by the trusted relayer, after it has verified the ZK proof
    // off-chain using the matching Barretenberg verifier.
    pub fn record_verified_nullifier(env: Env, relayer: Address, nullifier: BytesN<32>) {
        relayer.require_auth();
        let stored: Address = env.storage().instance().get(&DataKey::Relayer).unwrap();
        if relayer != stored {
            panic!("unauthorized relayer");
        }
        let key = DataKey::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&key) {
            panic!("nullifier already used");
        }
        env.storage().persistent().set(&key, &true);
    }

    pub fn is_verified(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Nullifier(nullifier))
    }
}
```

### 6.2 `payment_gateway`

Gates an actual asset transfer behind a verified nullifier.

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env};

#[contract]
pub struct PaymentGateway;

#[contractimpl]
impl PaymentGateway {
    pub fn send_payment(
        env: Env,
        registry_contract: Address,
        token_contract: Address,
        from: Address,
        to: Address,
        amount: i128,
        nullifier: BytesN<32>,
    ) {
        from.require_auth();

        let verified: bool = env.invoke_contract(
            &registry_contract,
            &soroban_sdk::Symbol::new(&env, "is_verified"),
            soroban_sdk::vec![&env, nullifier.into()],
        );
        if !verified {
            panic!("compliance proof not verified");
        }

        let token_client = token::Client::new(&env, &token_contract);
        token_client.transfer(&from, &to, &amount);
    }
}
```

Deploy with the current CLI (note: the command is `stellar`, the older `soroban` CLI name is deprecated):
```bash
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/compliance_registry.wasm \
  --source-account issuer \
  --network testnet \
  --alias compliance_registry
```

### 6.3 Stretch goal — Path A native verification

If you finish Path B early: Stellar's host environment exposes native BLS12-381 pairing operations, which means you could hand-write a Groth16 verifier directly in Rust inside a Soroban contract (porting the verification equation using those host functions) instead of relying on a relayer. This is the direction the Interstellar initiative is heading, but treat it as a days-11/12 stretch, not your critical path — getting curve/field representations to line up between Noir's witness output and Soroban's native BLS12-381 types is a real engineering project on its own.

---

## 7. Backend API Design

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/challenge` | Issue a nonce for the wallet to sign |
| POST | `/auth/verify` | Verify signature, issue JWT |
| POST | `/kyc/submit` | Submit mock KYC form + fake document |
| GET | `/kyc/status` | Check current KYC review status |
| POST | `/compliance/issue-attestation` | Compute flags, insert Merkle leaf, return salt + path to client |
| GET | `/compliance/root` | Return current published Merkle root + version |
| POST | `/compliance/publish-root` | Admin-triggered: push latest root on-chain |
| POST | `/verify/submit-proof` | Relayer endpoint: verify proof, call `record_verified_nullifier` on success |
| POST | `/payments/initiate` | Create a payment intent record |
| GET | `/payments/:id/status` | Poll payment + verification status |
| GET | `/admin/sanctions-sample` | Debug-only: view the mock sanctions list in use |

Example relayer route:
```ts
// routes/verify.ts
import { Router } from 'express';
import { verifyProof } from '../zk/verifier'; // wraps bb.js verify call
import { stellarClient } from '../stellar/client';

const router = Router();

router.post('/submit-proof', async (req, res) => {
  const { proof, publicInputs } = req.body; // { merkleRoot, currentTimestamp, nullifier }

  const isValid = await verifyProof(proof, publicInputs);
  if (!isValid) return res.status(400).json({ error: 'invalid proof' });

  const txHash = await stellarClient.recordVerifiedNullifier(publicInputs.nullifier);
  return res.json({ verified: true, txHash });
});

export default router;
```

Use `zod` for request validation, and rate-limit `/verify/submit-proof` and `/kyc/submit` since they're the most abuse-prone endpoints.

---

## 8. Database Schema (Prisma)

```prisma
model User {
  id            String   @id @default(uuid())
  walletAddress String   @unique
  createdAt     DateTime @default(now())
  kycSubmission KycSubmission?
  attestation   ComplianceAttestation?
  payments      Payment[]
}

model KycSubmission {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id])
  fullName      String
  dateOfBirth   DateTime
  countryCode   String
  documentMock  Boolean  @default(true)
  status        String   @default("pending") // pending | approved | rejected
  createdAt     DateTime @default(now())
}

model ComplianceAttestation {
  id              String   @id @default(uuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])
  leafIndex       Int
  leafCommitment  String   // hex
  kycPassed       Boolean
  sanctionsClear  Boolean
  countryEligible Boolean
  ageOver18       Boolean
  expiryTimestamp DateTime
  merkleRootAtIssuance String
  revoked         Boolean  @default(false)
  createdAt       DateTime @default(now())
}

model MerkleRootVersion {
  id          String   @id @default(uuid())
  rootHash    String
  version     Int      @unique
  publishedTx String?
  createdAt   DateTime @default(now())
}

model Nullifier {
  id           String   @id @default(uuid())
  nullifierHash String  @unique
  usedAt       DateTime @default(now())
  txHash       String
}

model Payment {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  recipientWallet String
  amount          String   // store as string to avoid float precision issues
  asset           String   @default("USDC")
  status          String   @default("pending") // pending | verified | settled | failed
  nullifierHash   String?
  txHash          String?
  createdAt       DateTime @default(now())
}
```

Never store `secret_salt` server-side past the single response that returns it to the client — that's the whole privacy guarantee, and it's worth saying explicitly in your demo.

---

## 9. Frontend Design

**Pages:**
1. **Landing** — explains the privacy pitch in one screen, "Connect Wallet" CTA
2. **Onboarding / Get Your Pass** — mock KYC form → fake document upload → "Generating your compliance pass…" loading state → success screen explicit about what just happened ("Your details were checked once, by our issuer, and never touch the blockchain")
3. **Send/Receive Payment** — recipient address, amount, asset; on submit: show a clear in-browser step "Generating zero-knowledge proof locally — this never leaves your device" with a progress indicator (proving takes a few seconds with `bb.js`), then "Verifying on Stellar…", then confirmation with a link to the transaction on Stellar Expert
4. **Dashboard** — pass status, expiry, payment history

**Key components:**
- `WalletConnectButton` — wraps Freighter / Stellar Wallets Kit
- `ProofGenerator` — runs `bb.js` in a Web Worker so the UI doesn't freeze during proving
- `PaymentStatusTracker` — polls `/payments/:id/status`
- `TransactionExplorerLink` — links straight to Stellar Expert testnet view, so judges can see for themselves that only a hash/event landed on-chain, never personal data

**State/data:** React Query for server state, lightweight Zustand store for the in-progress proof/payment flow.

**Stellar wallet integration:**
```ts
import { StellarWalletsKit, FREIGHTER_ID } from '@creit.tech/stellar-wallets-kit';

const kit = new StellarWalletsKit({ network: 'TESTNET', selectedWalletId: FREIGHTER_ID });
const { address } = await kit.getAddress();
const { signedTxXdr } = await kit.signTransaction(unsignedXdr);
```

**Client-side proving (the privacy-critical part):**
```ts
import { UltraHonkBackend } from '@aztec/bb.js';
import circuit from '../circuits/kyc_proof/target/kyc_proof.json';

const backend = new UltraHonkBackend(circuit.bytecode);
const { proof, publicInputs } = await backend.generateProof(witnessInputs);
// send only { proof, publicInputs } to the relayer — secret_salt, flags, and
// merkle path never leave the browser
```

---

## 10. Integrations / Third-Party Pieces

| Piece | Hackathon approach | Real-world swap-in later |
|---|---|---|
| Wallet | Freighter / Stellar Wallets Kit | Same |
| KYC provider | Self-built mock form | Persona, SumSub, Veriff |
| Sanctions check | Small real OFAC SDN sample CSV checked in your own code | Real-time OFAC/UN/EU sanctions API |
| On/off-ramp narrative | Mention only, don't build | Stellar Anchor Protocol (SEP-31) for actual fiat settlement |
| Asset | Stellar testnet USDC trustline or native XLM | Same on mainnet |

---

## 11. Security & Privacy Notes (worth stating explicitly to judges)

- The trusted-issuer model is the same trust assumption used by most real-world ZK identity systems today — you're not claiming to remove trust entirely, you're claiming to remove *exposure*: the issuer sees PII once, the chain and the relayer never do.
- Nullifiers prevent the same attestation from being silently reused to link two transactions to the same underlying person.
- `secret_salt` must never be logged, persisted server-side after issuance, or sent anywhere except inside the browser's proof generation.
- Revocation: if `ComplianceAttestation.revoked` is set true, the next Merkle root publish should exclude that leaf — explain this as your revocation mechanism even if you don't fully build the revoked-leaf-exclusion logic in 12 days.

---

## 12. 12-Day Build Timeline

| Day | Focus |
|---|---|
| 1 | Tooling install (Rust, Stellar CLI, Noir, bb), scaffold frontend + backend repos, create funded testnet accounts via Friendbot |
| 2 | Postgres + Prisma schema, backend skeleton, wallet-signature auth |
| 3 | Compliance Issuer Service: mock KYC form, mock sanctions check, off-chain Merkle tree (JS), attestation issuance endpoint |
| 4–5 | Noir circuit: write, `nargo test`, generate a proof natively with `bb` CLI to validate logic before touching the browser |
| 6 | `compliance_registry` contract: write, test, deploy to testnet, wire up `publish_root` from the issuer service |
| 7 | Relayer: in-browser `bb.js` proving working end-to-end → `/verify/submit-proof` → contract call, confirm nullifier shows up on-chain |
| 8 | `payment_gateway` contract + real Stellar asset transfer gated on verification |
| 9–10 | Full frontend flow: onboarding → pass issuance → proof generation UI → payment flow → dashboard |
| 11 | End-to-end testing, edge cases (expired pass, reused nullifier, wrong network), bug fixing |
| 12 | Polish UI, write pitch script, record a backup demo video (always record one — live demos fail) |

Build in this order, and don't start frontend polish before Day 6 has a contract you can actually call — a beautiful UI with nothing real behind it loses to a rough UI backed by real on-chain transactions every time.

---

## 13. Demo Script (aim for 3 minutes)

1. **Story, 20 seconds:** "Diego in the US is sending money to Maria in Argentina. Maria needs to prove she's KYC'd, not sanctioned, and old enough — without handing her passport to anyone else."
2. **Live, 90 seconds:** Walk through Maria's onboarding (mock KYC, fast), then the payment screen — open the browser network tab on screen and show literally nothing identifying is sent, just proof + public inputs.
3. **On-chain proof, 40 seconds:** Pull up the transaction on Stellar Expert. Point out the event only contains a nullifier hash, never PII.
4. **Close, 30 seconds:** State the trust model honestly ("issuer verifies once, chain never sees PII, relayer is open-source and auditable") and name the stretch path (native on-chain BLS12-381 verification) as where you'd take it next.

---

## 14. Honest Risks

- Don't attempt Path A (native on-chain Noir/BLS12-381 verification) as your primary path — the tooling for it is a live, in-progress initiative, not a stable library, and you will lose days to it.
- Poseidon hash implementations must match exactly between your JS Merkle tree code and the Noir circuit's `std::hash::poseidon` — mismatched parameters (different round constants/widths) is the single most common bug in this kind of project. Test this on Day 3–4, not Day 10.
- `bb.js` in-browser proving works but can be slow on older devices — keep circuit depth/complexity minimal and show a clear loading state rather than letting the UI look frozen.
