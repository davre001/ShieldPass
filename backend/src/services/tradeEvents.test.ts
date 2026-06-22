import { describe, it, expect } from 'vitest';
import { emitTradeUpdate, onTradeUpdate } from './tradeEvents';

describe('tradeEvents bus', () => {
  it('delivers an emitted trade to a subscriber', () => {
    const seen: any[] = [];
    const off = onTradeUpdate((t) => seen.push(t));
    emitTradeUpdate({ id: 't1', status: 'PAID' } as any);
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe('t1');
  });

  it('stops delivering after unsubscribe', () => {
    const seen: any[] = [];
    const off = onTradeUpdate((t) => seen.push(t));
    off();
    emitTradeUpdate({ id: 't2', status: 'SETTLED' } as any);
    expect(seen).toHaveLength(0);
  });
});
