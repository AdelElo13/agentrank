import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { signData, verifySignature } from '../../src/crypto/signing.ts';
import { generateKeyPair, loadOrCreateKeyPair, sha256, generateId, formatPublicKey } from '../../src/crypto/keys.ts';

describe('Signing', () => {
  it('signs and verifies data', () => {
    const kp = generateKeyPair();
    const data = 'hello world';
    const sig = signData(data, kp);
    expect(verifySignature(data, sig, kp.publicKey)).toBe(true);
  });

  it('rejects tampered data', () => {
    const kp = generateKeyPair();
    const sig = signData('original', kp);
    expect(verifySignature('tampered', sig, kp.publicKey)).toBe(false);
  });

  it('rejects wrong key', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const sig = signData('data', kp1);
    expect(verifySignature('data', sig, kp2.publicKey)).toBe(false);
  });
});

describe('Key Management', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'agentrank-keys-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('generates keypair with ID', () => {
    const kp = generateKeyPair();
    expect(kp.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(kp.privateKey.length).toBeGreaterThan(0);
    expect(kp.publicKey.length).toBeGreaterThan(0);
  });

  it('creates and loads keys from disk', async () => {
    const kp1 = await loadOrCreateKeyPair(tmpDir);
    const kp2 = await loadOrCreateKeyPair(tmpDir);
    expect(kp1.keyId).toBe(kp2.keyId);
  });

  it('formats public key', () => {
    const kp = generateKeyPair();
    expect(formatPublicKey(kp.publicKey)).toMatch(/^ed25519:.+$/);
  });

  it('generates unique IDs', () => {
    const id1 = generateId('task');
    const id2 = generateId('task');
    expect(id1).toMatch(/^task_[0-9a-f]{16}$/);
    expect(id1).not.toBe(id2);
  });

  it('computes SHA-256', () => {
    const hash = sha256('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('test')).toBe(hash); // deterministic
  });
});
