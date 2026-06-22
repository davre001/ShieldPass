import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db';

const emails: string[] = [];
afterEach(async () => {
  for (const email of emails) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.complianceAttestation.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
  emails.length = 0;
});

describe('POST /kyc/submit-bvn (email-keyed)', () => {
  it('creates a user by email, returns the BVN legal name + secret salt', async () => {
    const email = `bvn_${Date.now()}@test.com`;
    emails.push(email);
    const res = await request(app).post('/kyc/submit-bvn').send({ email, phone: '08000000000', bvn: '12345678901', pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.returnedName).toBe('string');
    expect(res.body.returnedName.length).toBeGreaterThan(0);
    expect(typeof res.body.secretSalt).toBe('string');
    expect(typeof res.body.merkleRoot).toBe('string');
    const u = await prisma.user.findUnique({ where: { email } });
    expect(u?.name).toBe(res.body.returnedName);
    expect(u?.pinHash).toBeTruthy();
  });

  it('rejects a malformed BVN with 400', async () => {
    const res = await request(app).post('/kyc/submit-bvn').send({ email: `x_${Date.now()}@test.com`, bvn: '123', pin: '1234' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing/short pin with 400', async () => {
    const res = await request(app).post('/kyc/submit-bvn').send({ email: `p_${Date.now()}@test.com`, bvn: '12345678901', pin: '1' });
    expect(res.status).toBe(400);
  });

  it('is idempotent on the same email (upsert, no duplicate)', async () => {
    const email = `dup_${Date.now()}@test.com`;
    emails.push(email);
    await request(app).post('/kyc/submit-bvn').send({ email, bvn: '12345678901', pin: '1234' });
    const res2 = await request(app).post('/kyc/submit-bvn').send({ email, bvn: '12345678901', pin: '1234' });
    expect(res2.status).toBe(200);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});

describe('POST /kyc/verify-pin', () => {
  async function onboard(email: string, pin: string) {
    emails.push(email);
    await request(app).post('/kyc/submit-bvn').send({ email, bvn: '12345678901', pin });
  }
  it('accepts the correct pin', async () => {
    const email = `vp_${Date.now()}@test.com`;
    await onboard(email, '4321');
    const res = await request(app).post('/kyc/verify-pin').send({ email, pin: '4321' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
  it('rejects a wrong pin', async () => {
    const email = `vpw_${Date.now()}@test.com`;
    await onboard(email, '4321');
    const res = await request(app).post('/kyc/verify-pin').send({ email, pin: '0000' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });
  it('404s for an unknown email', async () => {
    const res = await request(app).post('/kyc/verify-pin').send({ email: `none_${Date.now()}@test.com`, pin: '1234' });
    expect(res.status).toBe(404);
  });
});

describe('POST /kyc/link-wallet', () => {
  async function onboard(email: string) {
    emails.push(email);
    await request(app).post('/kyc/submit-bvn').send({ email, bvn: '12345678901', pin: '1234' });
  }

  it('links a smart wallet + passkey key id to the user', async () => {
    const email = `link_${Date.now()}@test.com`;
    await onboard(email);
    const res = await request(app).post('/kyc/link-wallet').send({
      email, smartWalletAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', passkeyKeyId: 'key_1',
    });
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { email } });
    expect(u?.smartWalletAddress).toBe('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
    expect(u?.passkeyKeyId).toBe('key_1');
  });

  it('rejects a bad smart wallet address with 400', async () => {
    const email = `linkbad_${Date.now()}@test.com`;
    await onboard(email);
    const res = await request(app).post('/kyc/link-wallet').send({ email, smartWalletAddress: 'NOTANADDRESS' });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown email', async () => {
    const res = await request(app).post('/kyc/link-wallet').send({
      email: `nope_${Date.now()}@test.com`, smartWalletAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    });
    expect(res.status).toBe(404);
  });
});
