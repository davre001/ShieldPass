import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

export function Header() {
  const location = useLocation();
  const [hasAttestation, setHasAttestation] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAttestation = () => {
      const stored = localStorage.getItem('shieldpass_attestation');
      setHasAttestation(!!stored);
    };
    checkAttestation();
    
    // Listen to storage changes to keep it updated in real-time
    window.addEventListener('storage', checkAttestation);
    // Also set an interval as fallback in case storage events are not fired on the same page
    const interval = setInterval(checkAttestation, 1000);

    return () => {
      window.removeEventListener('storage', checkAttestation);
      clearInterval(interval);
    };
  }, []);

  // Hide global header on landing page to avoid duplication with its inline header
  if (location.pathname === '/') {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--hairline)] bg-[var(--ink)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Brand/Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="h-2 w-2 rounded-full bg-[var(--rust)] animate-pulse" />
          <span className="font-display text-lg tracking-tight font-bold text-[var(--paper)] group-hover:text-[var(--rust)] transition-colors">
            ShieldPass
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <NavLink
            to="/onboarding"
            className={({ isActive }) =>
              `font-medium transition-colors ${
                isActive
                  ? 'text-[var(--rust)]'
                  : 'text-[var(--stone)] hover:text-[var(--paper)]'
              }`
            }
          >
            Verify ID
          </NavLink>
          <NavLink
            to="/marketplace"
            className={({ isActive }) =>
              `font-medium transition-colors ${
                isActive
                  ? 'text-[var(--rust)]'
                  : 'text-[var(--stone)] hover:text-[var(--paper)]'
              }`
            }
          >
            Marketplace
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `font-medium transition-colors ${
                isActive
                  ? 'text-[var(--rust)]'
                  : 'text-[var(--stone)] hover:text-[var(--paper)]'
              }`
            }
          >
            Dashboard
          </NavLink>
        </nav>

        {/* Attestation Status & Mobile Toggle */}
        <div className="flex items-center gap-4">
          {hasAttestation ? (
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--verified)]/30 bg-[var(--verified)]/[0.06] px-3 py-1 font-mono text-[10px] text-[var(--verified)] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--verified)]" />
              ZK PROOF READY
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--stone)]/30 bg-[var(--stone)]/[0.04] px-3 py-1 font-mono text-[10px] text-[var(--stone)] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--stone)]" />
              UNVERIFIED
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--hairline)] text-[var(--paper)] md:hidden hover:border-[var(--rust)] transition-colors focus:outline-none"
            aria-label="Toggle menu"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="border-t border-[var(--hairline)] bg-[var(--ink)] px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-4 text-sm">
            <NavLink
              to="/onboarding"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `font-medium transition-colors ${
                  isActive ? 'text-[var(--rust)]' : 'text-[var(--stone)]'
                }`
              }
            >
              Verify ID
            </NavLink>
            <NavLink
              to="/marketplace"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `font-medium transition-colors ${
                  isActive ? 'text-[var(--rust)]' : 'text-[var(--stone)]'
                }`
              }
            >
              Marketplace
            </NavLink>
            <NavLink
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `font-medium transition-colors ${
                  isActive ? 'text-[var(--rust)]' : 'text-[var(--stone)]'
                }`
              }
            >
              Dashboard
            </NavLink>
          </nav>
        </div>
      )}
    </header>
  );
}
