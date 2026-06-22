import { EventEmitter } from 'events';
import type { Trade } from '@prisma/client';

const bus = new EventEmitter();
bus.setMaxListeners(0); // many concurrent SSE connections

/** Broadcast a trade's latest state to all subscribers. Call after every status change. */
export function emitTradeUpdate(trade: Trade): void {
  bus.emit('trade', trade);
}

/** Subscribe to trade updates. Returns an unsubscribe function. */
export function onTradeUpdate(fn: (t: Trade) => void): () => void {
  bus.on('trade', fn);
  return () => bus.off('trade', fn);
}
