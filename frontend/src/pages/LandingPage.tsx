import { Link } from "react-router-dom";
import { WalletConnectButton } from "../components/WalletConnectButton";
import { useAuthStore } from "../store/useAuthStore";

export default function LandingPage() {
  const { walletAddress } = useAuthStore();

  return (
    <div className="flex min-h-[calc(100svh-120px)] flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900">
          <span className="text-indigo-600">Shield</span>Pass
        </h1>
        <p className="mx-auto max-w-lg text-lg text-gray-600">
          Prove you're compliant — KYC'd, not sanctioned, eligible country, 18+
          — without revealing your identity, documents, or which fact is which.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        {!walletAddress ? (
          <WalletConnectButton />
        ) : (
          <Link
            to="/onboarding"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Get your compliance pass
          </Link>
        )}
        {walletAddress && (
          <Link
            to="/dashboard"
            className="text-sm text-indigo-600 underline hover:text-indigo-800"
          >
            View dashboard
          </Link>
        )}
      </div>

      <div className="mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            title: "Zero knowledge",
            description:
              "Your identity is checked once. Only a cryptographic proof goes on-chain.",
          },
          {
            title: "In-browser proving",
            description:
              "The ZK proof is generated entirely in your browser — nothing private leaves your device.",
          },
          {
            title: "Stellar-native",
            description:
              "Payments gate on a verified nullifier recorded in a Soroban smart contract.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm"
          >
            <h3 className="text-sm font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
