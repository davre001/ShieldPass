import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from './db';

const ids: string[] = [];
afterEach(async () => {
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});

describe('User smart-wallet fields', () => {
  it('stores a smart wallet address + passkey key id', async () => {
    const u = await prisma.user.create({
      data: {
        email: `u_${Date.now()}@test.com`,
        smartWalletAddress: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`,
        passkeyKeyId: 'key_abc123',
      },
    });
    ids.push(u.id);
    expect(u.smartWalletAddress).toBe('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
    expect(u.passkeyKeyId).toBe('key_abc123');
  });

  it('defaults the new fields to null when omitted', async () => {
    const u = await prisma.user.create({ data: { email: `u_${Date.now()}_b@test.com` } });
    ids.push(u.id);
    expect(u.smartWalletAddress).toBeNull();
    expect(u.passkeyKeyId).toBeNull();
    expect(u.walletAddress).toBeNull();
  });
});
