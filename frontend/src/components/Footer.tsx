import React from "react";
import { Link } from "react-router-dom";
import { TextHoverEffect, FooterBackgroundGradient } from "./TextHoverEffect";

const NAV_LINKS = [
  { label: "Marketplace", to: "/marketplace" },
  { label: "Dashboard", to: "/dashboard" },
  { label: "Onboarding", to: "/onboarding" },
];

const META_LINKS = [
  { label: "Docs", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "Privacy", href: "#" },
];

export default function Footer() {
  return (
    <footer className="relative w-full border-t border-hairline overflow-hidden mt-auto z-10">
      {/* Radial gradient backdrop */}
      <FooterBackgroundGradient />

      {/* ── Big hover-text wordmark ── */}
      <div className="relative z-10 h-28 md:h-36 flex items-center justify-center px-6">
        <TextHoverEffect text="ShieldPass.zk" duration={0.3} />
      </div>

      {/* ── Nav + meta row ── */}
      <div className="relative z-10 border-t border-hairline px-6 md:px-12 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Page links */}
        <nav className="flex items-center gap-5 text-[10px] font-mono uppercase tracking-widest text-stone">
          {NAV_LINKS.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="hover:text-paper transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Status pill */}
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-verified opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-verified" />
          </span>
          <span className="text-stone">
            Stellar Testnet&nbsp;
            <span className="text-rust">Active</span>
          </span>
        </div>

        {/* Legal / external links */}
        <div className="flex items-center gap-5 text-[10px] font-mono uppercase tracking-widest text-stone">
          {META_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-paper transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Bottom strip ── */}
      <div className="relative z-10 border-t border-hairline px-6 md:px-12 py-3 flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-stone/50">
        <span>
          © {new Date().getFullYear()} ShieldPass.zk — All rights reserved
        </span>
        <span>
          Engine: <span className="text-verified">Noir WASM Prover Ready</span>
        </span>
      </div>
    </footer>
  );
}
