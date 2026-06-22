import { Keypair, Networks } from '@stellar/stellar-sdk';
import { StellarContractClient } from '@shieldpass/sdk';
import { prisma } from '../db';
import { payoutToSeller } from './paystack';
import { emitTradeUpdate } from './tradeEvents';

export interface SettlementDeps {
  releaseCrypto: (offerId: bigint, buyerWallet: string) => Promise<string>;
  payout: (amountKobo: number, sellerBankAccount: string) => Promise<string>;
}

/** Drives a PAID trade to SETTLED: release crypto to buyer, then pay Naira to seller. Exactly-once. */
export async function settleTrade(tradeId: string, deps: SettlementDeps): Promise<void> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error(`Trade ${tradeId} not found`);
  if (trade.status === 'SETTLED') return; // idempotent

  // 1. Release crypto (skip if a previous run already did it).
  if (trade.status === 'PAID') {
    if (!trade.escrowOfferId || !trade.buyerWallet) throw new Error(`Trade ${tradeId} missing escrowOfferId/buyerWallet`);
    const releaseTxHash = await deps.releaseCrypto(BigInt(trade.escrowOfferId), trade.buyerWallet);
    const sent = await prisma.trade.update({ where: { id: tradeId }, data: { status: 'CRYPTO_SENT', releaseTxHash } });
    emitTradeUpdate(sent);
  }

  // 2. Pay the seller's Naira.
  const amountKobo = Math.round(Number(trade.expectedAmount) * 100);
  const payoutRef = await deps.payout(amountKobo, trade.sellerBankAccount);
  const settled = await prisma.trade.update({ where: { id: tradeId }, data: { status: 'SETTLED', payoutRef, settledAt: new Date() } });
  emitTradeUpdate(settled);
}

/**
 * Real dependencies for production use. `sellerBankAccount` is stored as "bankCode:accountNumber:name".
 * The relayer secret doubles as the contract arbiter (see spec §12).
 */
export function defaultSettlementDeps(): SettlementDeps {
  const rpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
  const contractId = process.env.STELLAR_CONTRACT_ID || '';
  const arbiter = Keypair.fromSecret(process.env.STELLAR_RELAYER_SECRET || '');
  const stellar = new StellarContractClient(rpcUrl, Networks.TESTNET, contractId);

  return {
    releaseCrypto: (offerId, buyerWallet) => stellar.releaseCrypto(offerId, buyerWallet, arbiter),
    payout: (amountKobo, sellerBankAccount) => {
      const [bankCode, accountNumber, name] = sellerBankAccount.split(':');
      return payoutToSeller({ amountKobo, accountNumber, bankCode, name: name || 'Seller' });
    },
  };
}
