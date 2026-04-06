import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvaluatorKeyPair } from '../types.ts';

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function generateKeyPair(): EvaluatorKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const keyId = sha256(publicKey).slice(0, 16);
  return {
    privateKey: new Uint8Array(privateKey),
    publicKey: new Uint8Array(publicKey),
    keyId,
  };
}

export async function loadOrCreateKeyPair(keyDir: string): Promise<EvaluatorKeyPair> {
  try {
    const [priv, pub] = await Promise.all([
      readFile(join(keyDir, 'evaluator.key')),
      readFile(join(keyDir, 'evaluator.pub')),
    ]);
    const keyId = sha256(pub).slice(0, 16);
    return { privateKey: new Uint8Array(priv), publicKey: new Uint8Array(pub), keyId };
  } catch {
    const kp = generateKeyPair();
    await mkdir(keyDir, { recursive: true });
    await writeFile(join(keyDir, 'evaluator.key'), kp.privateKey);
    await writeFile(join(keyDir, 'evaluator.pub'), kp.publicKey);
    return kp;
  }
}

export function formatPublicKey(publicKey: Uint8Array): string {
  return `ed25519:${Buffer.from(publicKey).toString('base64')}`;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
