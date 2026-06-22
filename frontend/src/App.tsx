import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import MainLayout from "./components/MainLayout";
import WalletConnectButton from "./components/WalletConnectButton";
import { SessionProvider } from "./lib/session";

// Import all application page views
import LandingPage from "./pages/LandingPage";
import OnboardingPage from "./pages/OnboardingPage";
import MarketplacePage from "./pages/MarketplacePage";
import TradeRoomPage from "./pages/TradeRoomPage";
import DashboardPage from "./pages/DashboardPage";
import AboutPage from "./pages/AboutPage";
import DocsPage from "./pages/DocsPage";
import NotFoundPage from "./pages/notfound";

export default function App() {
  return (
    <SessionProvider>
    <Router>
      <Routes>
        {/* The Landing Page renders standalone to maintain its clean, minimal intro design */}
        <Route 
          path="/" 
          element={
            <LandingPage />
          } 
        />

        {/* Core application features are wrapped in your matching MainLayout shell */}
        <Route
          path="/onboarding"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <OnboardingPage />
            </MainLayout>
          }
        />

        <Route
          path="/marketplace"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <MarketplacePage />
            </MainLayout>
          }
        />

        <Route
          path="/trade/:id"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <TradeRoomPage />
            </MainLayout>
          }
        />

        <Route
          path="/dashboard"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <DashboardPage />
            </MainLayout>
          }
        />

        <Route
          path="/about"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <AboutPage />
            </MainLayout>
          }
        />

        <Route
          path="/docs"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <DocsPage />
            </MainLayout>
          }
        />

        {/* Fallback Catch-all Route: show a themed 404 inside the app shell */}
        <Route
          path="*"
          element={
            <MainLayout
              walletComponent={
                <WalletConnectButton />
              }
            >
              <NotFoundPage />
            </MainLayout>
          }
        />
      </Routes>
    </Router>
    </SessionProvider>
  );
}
