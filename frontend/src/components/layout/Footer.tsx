import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="w-full border-t border-[var(--hairline)] bg-[var(--ink)] py-12 text-center md:text-left mt-auto">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between md:items-start">
          
          {/* Logo and Tagline */}
          <div className="space-y-3 max-w-sm">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--rust)]" />
              <span className="font-display text-base tracking-tight font-bold text-[var(--paper)]">
                ShieldPass
              </span>
            </div>
            <p className="text-xs text-[var(--stone)] leading-relaxed">
              Private, ZK-powered P2P compliance for the Nigerian market. Built on Stellar, secured by zero-knowledge proofs.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col sm:flex-row justify-center md:justify-end gap-10 md:gap-16 text-xs font-mono">
            <div className="space-y-3">
              <h4 className="text-[var(--paper)] uppercase tracking-wider font-semibold">Navigate</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/" className="text-[var(--stone)] hover:text-[var(--rust)] transition-colors">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/onboarding" className="text-[var(--stone)] hover:text-[var(--rust)] transition-colors">
                    Verify ID
                  </Link>
                </li>
                <li>
                  <Link to="/marketplace" className="text-[var(--stone)] hover:text-[var(--rust)] transition-colors">
                    Marketplace
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="text-[var(--stone)] hover:text-[var(--rust)] transition-colors">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-[var(--paper)] uppercase tracking-wider font-semibold">Stellar ZK</h4>
              <ul className="space-y-2 text-[var(--stone)]">
                <li>
                  <a
                    href="https://stellar.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--rust)] transition-colors"
                  >
                    Stellar Network
                  </a>
                </li>
                <li>
                  <a
                    href="https://soroban.stellar.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--rust)] transition-colors"
                  >
                    Soroban Contracts
                  </a>
                </li>
                <li>
                  <a
                    href="https://noir-lang.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--rust)] transition-colors"
                  >
                    Noir Lang
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-12 pt-6 border-t border-[var(--hairline)] flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-[var(--stone)]">
          <p>© {new Date().getFullYear()} ShieldPass. All rights reserved.</p>
          <p>
            Your identity never touches the blockchain.
          </p>
        </div>
      </div>
    </footer>
  );
}
