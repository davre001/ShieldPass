import { Button } from "./common/Button";
import { useWallet } from "../hooks/useWallet";
import { truncateAddress } from "../utils/formatters";

export function WalletConnectButton() {
  const { walletAddress, connected, connecting, error, connect, disconnect } =
    useWallet();

  if (connected && walletAddress) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 sm:inline-block">
          {truncateAddress(walletAddress)}
        </span>
        <Button variant="secondary" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        size="sm"
        onClick={connect}
        loading={connecting}
      >
        Connect Wallet
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
