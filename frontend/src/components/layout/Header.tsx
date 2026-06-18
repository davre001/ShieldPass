import { Link, NavLink } from "react-router-dom";
import { WalletConnectButton } from "../WalletConnectButton";
import { useAuthStore } from "../../stores/authStore";

export function Header() {
  const { walletAddress } = useAuthStore();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-gray-900"
        >
          <p>
            <span className="text-indigo-600">Shield</span>Pass
          </p>
        </Link>

        {walletAddress && (
          <nav className="hidden gap-6 text-sm font-medium text-gray-600 sm:flex">
            <NavLink
              to="/onboarding"
              className={({ isActive }) =>
                isActive ? "text-indigo-600" : "hover:text-gray-900"
              }
            >
              Get Pass
            </NavLink>
            <NavLink
              to="/payment"
              className={({ isActive }) =>
                isActive ? "text-indigo-600" : "hover:text-gray-900"
              }
            >
              Send Payment
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? "text-indigo-600" : "hover:text-gray-900"
              }
            >
              Dashboard
            </NavLink>
          </nav>
        )}

        <WalletConnectButton />
      </div>
    </header>
  );
}
