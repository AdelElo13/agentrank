import { sign, verify } from 'node:crypto';
import { sha256 } from './keys.ts';
import type { EvaluatorKeyPair } from '../types.ts';

export function signData(data: string, keyPair: EvaluatorKeyPair): string {
  const hash = sha256(data);
  const hashBytes = Buffer.from(hash, 'hex');
  const signature = sign(null, hashBytes, {
    key: Buffer.from(keyPair.privateKey),
    format: 'der',
    type: 'pkcs8',
  });
  return signature.toString('base64');
}

export function verifySignature(
  data: string,
  signature: string,
  publicKey: Uint8Array,
): boolean {
  try {
    const hash = sha256(data);
    const hashBytes = Buffer.from(hash, 'hex');
    const sigBytes = Buffer.from(signature, 'base64');
    return verify(null, hashBytes, {
      key: Buffer.from(publicKey),
      format: 'der',
      type: 'spki',
    }, sigBytes);
  } catch {
    return false;
  }
}

export function signTaskRun(taskJson: string, keyPair: EvaluatorKeyPair): string {
  return signData(taskJson, keyPair);
}
