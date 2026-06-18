import React from "react";
import { Link, useLocation } from "react-router-dom";
import BackgroundShader from "./BackgroundShader";

interface MainLayoutProps {
  children: React.ReactNode;
  walletComponent?: React.ReactNode;
}

export default function MainLayout({
  children,
  walletComponent,
}: MainLayoutProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  // Active state checker helper for tracking matching sub-routes
  const isActive = (path: string) => currentPath === path;

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col selection:bg-rust selection:text-ink relative">
      {/* Global WebGL Canvas Layer (Pushed to background index via -z-10) */}
      <BackgroundShader />

      {/* EVER-PRESENT PINNED TOP HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 border-b border-hairline bg-ink/80 backdrop-blur-md">
        <div className="flex items-center gap-8">
          {/* Brand Logo & Anchor Link */}
          <Link
            to="/"
            className="flex items-center gap-3 font-mono text-lg font-bold tracking-tight text-paper hover:text-rust transition-colors group"
          >
            <img
              src="/favicon.png"
              alt="ShieldPass Logo"
              className="w-7 h-7 object-contain transition-transform group-hover:scale-105"
            />
            <span>
              ShieldPass<span className="text-rust">.zk</span>
            </span>
          </Link>

          {/* Navigation Routing Slots */}
          <nav className="hidden md:flex items-center gap-6 text-xs uppercase tracking-wider font-mono">
            <Link
              to="/marketplace"
              className={`transition-colors ${isActive("/marketplace") ? "text-rust font-semibold" : "text-stone hover:text-paper"}`}
            >
              Marketplace
            </Link>
            <Link
              to="/dashboard"
              className={`transition-colors ${isActive("/dashboard") ? "text-rust font-semibold" : "text-stone hover:text-paper"}`}
            >
              Dashboard
            </Link>
          </nav>
        </div>

        {/* Wallet Connection Alignment Anchor */}
        <div className="flex items-center gap-4">
          {walletComponent && <div className="z-10">{walletComponent}</div>}
        </div>
      </header>

      {/* MAIN CONTENT WORKSPACE LAYOUT */}
      {/* pt-24 is critical here; it offsets layout items down so they do not slide behind the fixed header */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-12 pt-24 animate-fade-in relative z-10">
        {children}
      </main>

      {/* CRYPTOGRAPHIC METADATA SUB-FOOTER STRIP */}
      {/* Translucent background setup lets shader patterns roll beneath metadata labels */}
      <footer className="w-full border-t border-hairline py-6 px-6 md:px-12 bg-ink/40 backdrop-blur-sm text-center flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-stone tracking-widest uppercase mt-auto relative z-10">
        <div>
          Network Status:{" "}
          <span className="text-rust">Stellar Testnet // Active</span>
        </div>

        {/* Centered Footer Decorative Logo Element */}
        <div className="flex items-center gap-2 opacity-40 hover:opacity-80 transition-opacity">
          <img
            src="/favicon.png"
            alt="ShieldPass Logo"
            className="w-5 h-5 object-contain grayscale brightness-200"
          />
          <span className="font-bold tracking-tight text-paper text-xs lowercase tracking-normal">
            shieldpass.zk
          </span>
        </div>

        <div>
          Engine Execution:{" "}
          <span className="text-verified">Noir WASM Prover Ready</span>
        </div>
      </footer>
    </div>
  );
}
