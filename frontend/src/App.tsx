import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import MainLayout from "./components/MainLayout";
import { SessionProvider, useSession } from "./lib/session";

import LandingPage from "./pages/LandingPage";
import OnboardingPage from "./pages/OnboardingPage";
import SwapPage from "./pages/SwapPage";
import DashboardPage from "./pages/DashboardPage";
import AboutPage from "./pages/AboutPage";
import DocsPage from "./pages/DocsPage";
import NotFoundPage from "./pages/notfound";

function ProfileButton() {
  const session = useSession();
  if (!session.onboarded) return null;
  return (
    <div className="font-mono text-xs border border-white/10 bg-white/5 px-4 py-2 rounded-xl text-white/70">
      {session.email}
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/onboarding" element={
          <MainLayout walletComponent={<ProfileButton />}>
            <OnboardingPage />
          </MainLayout>
        } />

        <Route path="/swap" element={
          <MainLayout walletComponent={<ProfileButton />}>
            <SwapPage />
          </MainLayout>
        } />

        <Route path="/dashboard" element={
          <MainLayout walletComponent={<ProfileButton />}>
            <DashboardPage />
          </MainLayout>
        } />

        <Route path="/about" element={
          <MainLayout walletComponent={<ProfileButton />}>
            <AboutPage />
          </MainLayout>
        } />

        <Route path="/docs" element={
          <MainLayout walletComponent={<ProfileButton />}>
            <DocsPage />
          </MainLayout>
        } />

        {/* Redirect old marketplace links to swap */}
        <Route path="/marketplace" element={<Navigate to="/swap" replace />} />

        <Route path="*" element={
          <MainLayout walletComponent={<ProfileButton />}>
            <NotFoundPage />
          </MainLayout>
        } />
      </Routes>
    </Router>
    </SessionProvider>
  );
}
