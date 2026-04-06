import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { signData } from './crypto/signing.ts';
import { generateId } from './crypto/keys.ts';
import { redactProfile } from './privacy/redaction.ts';
import type { AgentProfile, ScoreSnapshot, EvaluatorKeyPair, PrivacyMode } from './types.ts';

/**
 * Create a signed score snapshot.
 */
export function createSnapshot(
  profile: AgentProfile,
  evaluatorId: string,
  evaluatorVersion: string,
  scoringVersion: string,
  keyPair?: EvaluatorKeyPair,
  privacyMode: PrivacyMode = 'redacted',
): ScoreSnapshot {
  const redacted = redactProfile(profile, privacyMode);

  const snapshot: ScoreSnapshot = {
    snapshot_id: generateId('snap'),
    agent_id: profile.agent_id,
    timestamp: new Date().toISOString(),
    profile: redacted,
    evaluator_id: evaluatorId,
    evaluator_version: evaluatorVersion,
    scoring_model_version: scoringVersion,
    privacy_mode: privacyMode,
  };

  if (keyPair) {
    const dataToSign = JSON.stringify({ ...snapshot, signature: undefined });
    const signature = signData(dataToSign, keyPair);
    return { ...snapshot, signature };
  }

  return snapshot;
}

/**
 * Save snapshot to disk.
 */
export async function saveSnapshot(
  dataDir: string,
  snapshot: ScoreSnapshot,
): Promise<string> {
  const snapshotDir = join(dataDir, 'snapshots');
  await mkdir(snapshotDir, { recursive: true });

  const filename = `${snapshot.snapshot_id}.json`;
  const path = join(snapshotDir, filename);
  await writeFile(path, JSON.stringify(snapshot, null, 2), 'utf-8');
  return path;
}
