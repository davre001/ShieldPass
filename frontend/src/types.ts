export interface ComplianceAttestation {
  merkleRoot: string;
  secretSalt: string;
}

export interface P2POffer {
  id: string;
  sellerId: string;
  sellerAddress: string;
  assetType: 'USDC' | 'XLM' | 'NGNC' | string;
  cryptoAmount: string;
  nairaRate: string;
  status: 'open' | 'locked' | 'completed';
  createdAt: string;
}

export interface Balance {
  assetCode: string;
  balance: string;
}

export interface TradeHistoryItem {
  id: string;
  role: 'buyer' | 'seller';
  cryptoAmount: string;
  assetType: string;
  nairaAmount: string;
  status: 'open' | 'locked' | 'completed';
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
}