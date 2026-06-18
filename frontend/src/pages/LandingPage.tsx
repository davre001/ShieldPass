import { Link } from "react-router-dom";
import BackgroundShader from "../components/BackgroundShader";

// Landing page — Implementation.md section 9.1.
// The hero leads with the actual mechanism (ZK proof → escrow) rather than a
// generic stat block, since the thesis of the product IS the mechanism.

export default function LandingPage() {
  return (
    <div className="min-h-screen text-(--paper) flex flex-col relative">
      {/* Same shader as every other page */}
      <BackgroundShader />

      {/* HEADER — mirrors MainLayout's pinned header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 border-b border-(--hairline) bg-black/60 backdrop-blur-md">
        <Link
          to="/"
          className="flex items-center gap-3 font-mono text-lg font-bold tracking-tight text-(--paper) hover:text-(--rust) transition-colors group"
        >
          <img
            src="/favicon.png"
            alt="ShieldPass Logo"
            className="w-7 h-7 object-contain transition-transform group-hover:scale-105"
          />
          <span>
            ShieldPass<span className="text-(--rust)">.zk</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-(--stone)">
          <a
            href="#how-it-works"
            className="hover:text-(--paper) transition-colors font-mono text-xs uppercase tracking-wider"
          >
            How it works
          </a>
          <Link
            to="/onboarding"
            className="rounded-sm border border-(--paper)/30 px-4 py-2 text-(--paper) font-mono text-xs uppercase tracking-wider hover:border-(--rust) hover:text-(--rust) transition-colors"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 relative z-10 pt-20">
        <section className="px-6 md:px-12 pt-20 pb-16 max-w-4xl">
          <p className="font-mono text-xs uppercase tracking-widest text-(--rust) mb-4">
            Private P2P · Built on Stellar
          </p>
          <h1 className="font-display text-4xl md:text-6xl leading-[1.05] mb-6">
            Trade Crypto for Naira.
            <br />
            <br />
            With Zero Identity Exposure.
          </h1>
          <p className="text-lg text-(--stone) max-w-xl mb-10">
            ShieldPass lets you trade crypto for Naira peer-to-peer, with the
            safety of KYC and none of the exposure. Your BVN never touches the
            blockchain — only a cryptographic proof that you passed.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/onboarding"
              className="bg-(--rust) text-(--ink) font-medium px-6 py-3 rounded-sm hover:bg-(--rust)/90 transition-colors"
            >
              Start verification
            </Link>
            <Link
              to="/marketplace"
              className="text-(--paper) underline decoration-(--hairline) underline-offset-4 hover:decoration-(--rust) transition-colors"
            >
              Browse the marketplace
            </Link>
          </div>
        </section>

        <section
          id="how-it-works"
          className="px-6 md:px-12 py-16 border-t border-(--hairline)"
        >
          <h2 className="font-display text-2xl mb-10">
            What actually happens on-chain
          </h2>
          <div className="grid md:grid-cols-3 gap-px bg-(--hairline) border border-(--hairline)">
            {[
              {
                title: "Verify once",
                body: "Link your BVN through our partner flow. We compute three flags — human, resident, not flagged — and commit them to a Merkle tree.",
              },
              {
                title: "Prove in your browser",
                body: "When you trade, your device generates a zero-knowledge proof locally. Your secret salt and BVN never leave your machine.",
              },
              {
                title: "Trade with confidence",
                body: "A relayer checks the proof and records only a nullifier on-chain. The escrow contract releases funds once you confirm payment.",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="bg-black/30 backdrop-blur-sm p-8"
              >
                <h3 className="font-display text-xl mb-3">{step.title}</h3>
                <p className="text-(--stone) text-sm leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 md:px-12 py-16 border-t border-(--hairline)">
          <div className="font-mono text-xs uppercase tracking-widest text-(--stone) mb-3">
            Demo disclosure
          </div>
          <p className="text-(--stone) max-w-2xl text-sm leading-relaxed">
            This build uses a mock BVN provider in place of a licensed identity
            API, and assumes honest seller behavior in place of a full dispute
            panel. The proof generation, Merkle tree, and Soroban contracts are
            real.
          </p>
        </section>
      </main>
    </div>
  );
}
