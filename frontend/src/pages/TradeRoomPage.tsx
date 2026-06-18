import { useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { markPaymentSent } from "../lib/api";
import { releaseCrypto } from "../lib/stellar";
import WalletConnectButton from "../components/WalletConnectButton";
import type { BankDetails, P2POffer } from "../types";

// Trade room — Implementation.md section 9.4.
// Reached from the marketplace once a buyer's proof clears (sequence steps
// 8-9). One screen serves both sides of the trade since the demo has no
// separate seller console: the buyer sees bank transfer instructions, and
// whoever connects the wallet matching the offer's seller address sees the
// release control. Per the landing page's demo disclosure, there's no
// dispute flow — release is a one-way action that trusts the seller to act
// once Naira has actually landed in their account.

type LocationState = {
  offer: P2POffer;
  nullifier: string;
  bankDetails: BankDetails;
};

type ReleaseStage = "idle" | "releasing" | "released" | "error";

export default function TradeRoomPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [paymentSent, setPaymentSent] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [releaseStage, setReleaseStage] = useState<ReleaseStage>("idle");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="min-h-screen bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--rust)] mb-3">
            Trade #{id}
          </p>
          <h1 className="font-display text-2xl mb-4">
            This trade room isn't open here
          </h1>
          <p className="text-[var(--stone)] text-sm mb-8">
            Trade details live in this browser tab only for the demo — they
            aren't refetched from the server on a reload. Head back to the
            marketplace and accept the offer again.
          </p>
          <Link
            to="/marketplace"
            className="inline-block bg-[var(--rust)] text-[var(--ink)] font-medium px-6 py-3 rounded-sm hover:bg-[var(--rust)]/90 transition-colors"
          >
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  const { offer, nullifier, bankDetails } = state;
  const isSeller =
    walletAddress !== null && walletAddress === offer.sellerAddress;
  const nairaAmount = (
    parseFloat(offer.cryptoAmount) * parseFloat(offer.nairaRate)
  ).toLocaleString("en-NG", { maximumFractionDigits: 2 });

  async function handleMarkPaid() {
    setMarkError(null);
    setMarkingPaid(true);
    try {
      await markPaymentSent(offer.id);
      setPaymentSent(true);
    } catch (err) {
      setMarkError(
        err instanceof Error ? err.message : "Could not record payment.",
      );
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleRelease() {
    if (!walletAddress) return;
    setReleaseError(null);
    setReleaseStage("releasing");
    try {
      const { hash } = await releaseCrypto(offer.id, walletAddress);
      setTxHash(hash);
      setReleaseStage("released");
    } catch (err) {
      setReleaseStage("error");
      setReleaseError(err instanceof Error ? err.message : "Release failed.");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--paper)] px-6 md:px-12 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/marketplace"
          className="font-mono text-xs text-[var(--stone)] hover:text-[var(--paper)] transition-colors"
        >
          ← Back to marketplace
        </Link>

        <div className="flex items-baseline justify-between mt-6 mb-8">
          <h1 className="font-display text-3xl">Trade in escrow</h1>
          <span className="font-mono text-xs text-[var(--stone)]">
            #{offer.id}
          </span>
        </div>

        <div className="border border-[var(--hairline)] rounded-sm p-6 mb-6">
          <dl className="grid grid-cols-2 gap-y-3 font-mono text-sm">
            <dt className="text-[var(--stone)]">Crypto in escrow</dt>
            <dd className="text-right">
              {offer.cryptoAmount} {offer.assetType}
            </dd>
            <dt className="text-[var(--stone)]">Amount to pay</dt>
            <dd className="text-right">₦{nairaAmount}</dd>
            <dt className="text-[var(--stone)]">Proof nullifier</dt>
            <dd className="text-right break-all">{nullifier.slice(0, 18)}…</dd>
          </dl>
        </div>

        <section className="border border-[var(--hairline)] rounded-sm p-6 mb-6">
          <h2 className="font-display text-lg mb-1">Send the Naira</h2>
          <p className="text-[var(--stone)] text-sm mb-5">
            Transfer ₦{nairaAmount} to the seller's account below, then confirm
            it's sent. Include trade #{offer.id} as your transfer narration so
            the seller can match it.
          </p>
          <dl className="space-y-3 font-mono text-sm mb-6">
            <div className="flex justify-between">
              <dt className="text-[var(--stone)]">Bank</dt>
              <dd>{bankDetails.bankName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--stone)]">Account name</dt>
              <dd>{bankDetails.accountName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--stone)]">Account number</dt>
              <dd>{bankDetails.accountNumber}</dd>
            </div>
          </dl>

          {markError && (
            <p className="text-[var(--rust)] text-sm mb-4">{markError}</p>
          )}

          {!paymentSent ? (
            <button
              onClick={handleMarkPaid}
              disabled={markingPaid}
              className="w-full bg-[var(--rust)] text-[var(--ink)] font-medium px-6 py-3 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--rust)]/90 transition-colors"
            >
              {markingPaid ? "Recording…" : "I've sent the payment"}
            </button>
          ) : (
            <p className="text-[var(--verified)] text-sm font-medium">
              ✓ Marked as paid — waiting for the seller to release the crypto.
            </p>
          )}
        </section>

        <section className="border border-[var(--hairline)] rounded-sm p-6">
          <h2 className="font-display text-lg mb-1">Release crypto</h2>
          <p className="text-[var(--stone)] text-sm mb-5">
            Seller only. Connect the wallet that created this offer once you've
            confirmed the Naira landed in your account — this is a one-way
            action with no dispute step in this demo.
          </p>

          <div className="mb-5">
            <WalletConnectButton
              connectedAddress={walletAddress}
              onConnect={setWalletAddress}
            />
          </div>

          {walletAddress && !isSeller && (
            <p className="text-[var(--stone)] text-sm">
              This wallet isn't the seller on this offer, so release is disabled
              here.
            </p>
          )}

          {releaseError && (
            <p className="text-[var(--rust)] text-sm mb-4">{releaseError}</p>
          )}

          {isSeller && releaseStage !== "released" && (
            <button
              onClick={handleRelease}
              disabled={releaseStage === "releasing"}
              className="w-full bg-[var(--verified)] text-[var(--ink)] font-medium px-6 py-3 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--verified)]/90 transition-colors mt-2"
            >
              {releaseStage === "releasing" ? "Releasing…" : "Release crypto"}
            </button>
          )}

          {releaseStage === "released" && txHash && (
            <div className="mt-2">
              <p className="text-[var(--verified)] text-sm font-medium mb-3">
                ✓ Crypto released to the buyer
              </p>
              <div className="flex items-center gap-4">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs underline decoration-[var(--hairline)] underline-offset-4 hover:decoration-[var(--rust)] transition-colors"
                >
                  View on Stellar Expert
                </a>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="font-mono text-xs text-[var(--stone)] hover:text-[var(--paper)] transition-colors"
                >
                  Go to dashboard →
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
