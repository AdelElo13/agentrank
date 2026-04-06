import type { TaskRun, AgentProfile, PrivacyMode, ScoreSnapshot } from '../types.ts';

/**
 * Redact a task for sharing/export.
 */
export function redactTask(task: TaskRun, mode: PrivacyMode): TaskRun {
  if (mode === 'full') return task;

  if (mode === 'redacted') {
    return {
      ...task,
      goal: '[redacted]',
      redacted: true,
    };
  }

  // hashes_only
  return {
    ...task,
    goal: '[redacted]',
    evidence: task.evidence.map((e) => ({
      ...e,
      source_proof_id: undefined,
    })),
    related_proof_ids: [],
    redacted: true,
  };
}

/**
 * Redact a profile for sharing.
 */
export function redactProfile(profile: AgentProfile, mode: PrivacyMode): AgentProfile {
  if (mode === 'full') return profile;
  // Profiles don't contain PII directly, but strip model_version in hashes_only
  if (mode === 'hashes_only') {
    return { ...profile, model_version: undefined };
  }
  return profile;
}

/**
 * Redact a snapshot for sharing.
 */
export function redactSnapshot(snapshot: ScoreSnapshot, mode: PrivacyMode): ScoreSnapshot {
  if (mode === 'full') return snapshot;
  return {
    ...snapshot,
    profile: redactProfile(snapshot.profile, mode),
    privacy_mode: mode,
  };
}
