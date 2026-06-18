import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { submitBvn, issueAttestation } from "../lib/api";
import type { ComplianceAttestation } from "../types";

// Onboarding page — Implementation.md section 9.2.
// Mock BVN entry: a 10-digit number that auto-approves, standing in for a
// real identity provider (section 1, "What's mocked").

type Stage = "form" | "submitting" | "issuing" | "done" | "error";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [bvn, setBvn] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attestation, setAttestation] = useState<ComplianceAttestation | null>(
    null,
  );

  const isValidBvn = /^\d{10}$/.test(bvn);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidBvn) return;

    setErrorMessage(null);
    setStage("submitting");

    try {
      const { accepted } = await submitBvn(bvn);
      if (!accepted) {
        setStage("error");
        setErrorMessage(
          "BVN could not be verified. Check the number and try again.",
        );
        return;
      }

      setStage("issuing");
      const result = await issueAttestation();

      // The secret_salt and merkle path are the user's private proving material.
      // Per Implementation.md section 5: "DO NOT store salt server-side" — so the
      // client is the only place this can persist. A real build should encrypt
      // this at rest (e.g. wrapped by a device key) rather than storing it plain.
      localStorage.setItem("shieldpass_attestation", JSON.stringify(result));

      setAttestation(result);
      setStage("done");
    } catch (err) {
      setStage("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong during verification.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--rust)] mb-3">
          Step 1 of 1
        </p>
        <h1 className="font-display text-3xl mb-2">Verify your identity</h1>
        <p className="text-[var(--stone)] text-sm mb-8">
          This demo uses a mock BVN check. Enter any 10-digit number — in
          production this step calls a licensed provider like Paystack or Mono.
        </p>

        {stage !== "done" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="bvn"
                className="block text-sm text-[var(--stone)] mb-2"
              >
                BVN
              </label>
              <input
                id="bvn"
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={bvn}
                onChange={(e) => setBvn(e.target.value.replace(/\D/g, ""))}
                placeholder="2211XXXXXX"
                disabled={stage === "submitting" || stage === "issuing"}
                className="font-mono w-full bg-transparent border border-[var(--hairline)] rounded-sm px-4 py-3 text-[var(--paper)] placeholder:text-[var(--stone)]/60 focus:border-[var(--rust)] transition-colors"
              />
            </div>

            {stage === "error" && errorMessage && (
              <p className="text-sm text-[var(--rust)]">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={
                !isValidBvn || stage === "submitting" || stage === "issuing"
              }
              className="w-full bg-[var(--rust)] text-[var(--ink)] font-medium px-6 py-3 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--rust)]/90 transition-colors"
            >
              {stage === "submitting" && "Checking BVN…"}
              {stage === "issuing" && "Issuing attestation…"}
              {(stage === "form" || stage === "error") && "Continue"}
            </button>
          </form>
        )}

        {stage === "done" && attestation && (
          <div className="border border-[var(--hairline)] rounded-sm p-6">
            <p className="text-[var(--verified)] text-sm font-medium mb-4">
              ✓ Verified — attestation issued
            </p>
            <dl className="space-y-3 font-mono text-xs text-[var(--stone)]">
              <div>
                <dt className="mb-1">Merkle root</dt>
                <dd className="text-[var(--paper)] break-all">
                  {attestation.merkleRoot}
                </dd>
              </div>
              <div>
                <dt className="mb-1">Secret salt (kept on this device only)</dt>
                <dd className="text-[var(--paper)] break-all">
                  {attestation.secretSalt}
                </dd>
              </div>
            </dl>
            <button
              onClick={() => navigate("/marketplace")}
              className="mt-6 w-full bg-[var(--verified)] text-[var(--ink)] font-medium px-6 py-3 rounded-sm hover:bg-[var(--verified)]/90 transition-colors"
            >
              Enter marketplace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
