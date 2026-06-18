import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listOffers, acceptOffer, submitProof } from "../lib/api";
import { generateKycProof } from "../lib/proof";
import type { ComplianceAttestation, P2POffer } from "../types";

// P2P Marketplace (order book) — Implementation.md section 9.3.
// Accepting an offer triggers in-browser proof generation (sequence steps 5-7
// in section 2) before the trade room unlocks.

type AcceptingState = {
  offerId: string;
  phase: "proving" | "verifying";
} | null;

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<P2POffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<AcceptingState>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    listOffers()
      .then((data) => setOffers(data.filter((o) => o.status === "open")))
      .catch((err) =>
        setLoadError(
          err instanceof Error ? err.message : "Failed to load offers",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleAccept(offer: P2POffer) {
    setAcceptError(null);

    const stored = localStorage.getItem("shieldpass_attestation");
    if (!stored) {
      setAcceptError(
        "No attestation found on this device. Complete verification first.",
      );
      return;
    }
    const attestation: ComplianceAttestation = JSON.parse(stored);

    try {
      setAccepting({ offerId: offer.id, phase: "proving" });
      const proof = await generateKycProof({
        attestation,
        flags: { isHuman: 1, bvnVerified: 1, goodStanding: 1 },
      });

      setAccepting({ offerId: offer.id, phase: "verifying" });
      const verification = await submitProof(proof);
      if (!verification.verified) {
        throw new Error("Proof rejected by relayer.");
      }

      const { bankDetails } = await acceptOffer(
        offer.id,
        verification.nullifier,
      );

      navigate(`/trade/${offer.id}`, {
        state: { offer, nullifier: verification.nullifier, bankDetails },
      });
    } catch (err) {
      setAcceptError(
        err instanceof Error ? err.message : "Failed to accept offer",
      );
    } finally {
      setAccepting(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--paper)] px-6 md:px-12 py-12">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-display text-3xl">Marketplace</h1>
        <p className="font-mono text-xs text-[var(--stone)]">
          {offers.length} open offers
        </p>
      </div>

      {loading && (
        <p className="text-[var(--stone)] text-sm">Loading offers…</p>
      )}
      {loadError && <p className="text-[var(--rust)] text-sm">{loadError}</p>}
      {acceptError && (
        <p className="text-[var(--rust)] text-sm mb-4">{acceptError}</p>
      )}

      {!loading && !loadError && offers.length === 0 && (
        <p className="text-[var(--stone)] text-sm">
          No open offers right now. Check back shortly.
        </p>
      )}

      <div className="border border-[var(--hairline)] rounded-sm divide-y divide-[var(--hairline)]">
        {offers.map((offer) => {
          const isBusy = accepting?.offerId === offer.id;
          return (
            <div
              key={offer.id}
              className="flex items-center justify-between px-6 py-5 hover:bg-[var(--paper)]/[0.02] transition-colors"
            >
              <div className="flex items-baseline gap-6">
                <span className="font-mono text-lg">
                  {offer.cryptoAmount} {offer.assetType}
                </span>
                <span className="text-[var(--stone)] text-sm">
                  ₦{offer.nairaRate} / {offer.assetType}
                </span>
              </div>
              <button
                onClick={() => handleAccept(offer)}
                disabled={isBusy || accepting !== null}
                className="font-mono text-sm border border-[var(--rust)] text-[var(--rust)] px-4 py-2 rounded-sm hover:bg-[var(--rust)] hover:text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isBusy &&
                  accepting?.phase === "proving" &&
                  "Generating proof…"}
                {isBusy && accepting?.phase === "verifying" && "Verifying…"}
                {!isBusy && "Accept offer"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
