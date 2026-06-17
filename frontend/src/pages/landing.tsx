"use client";

import Link from "next/link";
import { WalletConnectButton } from "./WalletConnectButton";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">ShieldPass</h1>
      <p className="max-w-md text-gray-600">
        Prove you're compliant — KYC'd, not sanctioned, eligible country, 18+ —
        without revealing your identity, documents, or which fact is which.
      </p>
      <WalletConnectButton />
      <Link href="/onboarding" className="text-sm text-indigo-600 underline">
        Get your compliance pass
      </Link>
    </div>
  );
}
