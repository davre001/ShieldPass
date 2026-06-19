import React from "react";
import { Link, useLocation } from "react-router-dom";
import BackgroundShader from "./BackgroundShader";
import Footer from "./Footer";

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
  const isActive = (path: string) => currentPath === path;

  return (
    <div className="min-h-screen text-paper flex flex-col selection:bg-rust selection:text-ink relative">
      {/* Renders the pristine WebGL 2 cosmic aurora backdrop */}
      <BackgroundShader />

      {/* EVER-PRESENT PINNED TOP HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 border-b border-hairline bg-black/60 backdrop-blur-md">
        <div className="flex items-center gap-8">
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

        <div className="flex items-center gap-4">
          {walletComponent && <div className="z-10">{walletComponent}</div>}
        </div>
      </header>

      {/* PRIMARY RENDER BLOCK */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-12 pt-24 animate-fade-in relative z-10">
        {children}
      </main>

      {/* HOVER FOOTER */}
      <Footer />
    </div>
  );
}
