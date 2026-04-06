import { readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { ProofEntry } from './types.ts';

/**
 * Reads proof entries from agentproofs segmented storage.
 * Supports the segments/*.jsonl layout from agentproofs v3.
 */

export async function readProofEntries(
  proofsDir: string,
  options?: {
    readonly fromDate?: string;
    readonly toDate?: string;
    readonly agentId?: string;
  },
): Promise<readonly ProofEntry[]> {
  const segmentsDir = join(proofsDir, 'segments');
  const entries: ProofEntry[] = [];

  let segmentFiles: string[];
  try {
    const files = await readdir(segmentsDir);
    segmentFiles = files.filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }

  for (const file of segmentFiles) {
    const filePath = join(segmentsDir, file);
    const rl = createInterface({
      input: createReadStream(filePath, 'utf-8'),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as ProofEntry;

        if (options?.fromDate && entry.timestamp < options.fromDate) continue;
        if (options?.toDate && entry.timestamp > options.toDate) continue;
        if (options?.agentId && entry.agent_id !== options.agentId) continue;

        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }
  }

  return entries;
}

/**
 * Groups proof entries by session.
 */
export function groupBySession(
  entries: readonly ProofEntry[],
): ReadonlyMap<string, readonly ProofEntry[]> {
  const sessions = new Map<string, ProofEntry[]>();
  for (const entry of entries) {
    const existing = sessions.get(entry.session_id);
    if (existing) {
      existing.push(entry);
    } else {
      sessions.set(entry.session_id, [entry]);
    }
  }
  return sessions;
}

/**
 * Extracts tool-related proofs from a session.
 */
export function getToolProofs(entries: readonly ProofEntry[]): readonly ProofEntry[] {
  return entries.filter((e) =>
    e.event_type === 'tool_started' ||
    e.event_type === 'tool_completed' ||
    e.event_type === 'tool_failed' ||
    e.event_type === 'tool_denied'
  );
}

/**
 * Computes execution metrics from proof entries.
 */
export function computeExecutionMetrics(entries: readonly ProofEntry[]): {
  total_tool_calls: number;
  tool_success_rate: number;
  median_duration_ms: number;
  retry_rate: number;
  recovery_rate: number;
} {
  const toolCompletions = entries.filter(
    (e) => e.event_type === 'tool_completed' || e.event_type === 'tool_failed',
  );

  if (toolCompletions.length === 0) {
    return {
      total_tool_calls: 0,
      tool_success_rate: 0,
      median_duration_ms: 0,
      retry_rate: 0,
      recovery_rate: 0,
    };
  }

  const successes = toolCompletions.filter((e) => e.action.success);
  const failures = toolCompletions.filter((e) => !e.action.success);

  // Durations
  const durations = toolCompletions
    .map((e) => e.action.duration_ms)
    .filter((d): d is number => d !== undefined)
    .sort((a, b) => a - b);
  const median = durations.length > 0
    ? durations[Math.floor(durations.length / 2)]
    : 0;

  // Retry detection: same tool + same input_hash appearing multiple times
  const toolInputCounts = new Map<string, number>();
  for (const e of toolCompletions) {
    const key = `${e.action.tool ?? ''}:${e.action.input_hash}`;
    toolInputCounts.set(key, (toolInputCounts.get(key) ?? 0) + 1);
  }
  const retries = Array.from(toolInputCounts.values()).filter((c) => c > 1).length;
  const retryRate = toolInputCounts.size > 0 ? retries / toolInputCounts.size : 0;

  // Recovery: failure followed by success with same tool
  let recoveries = 0;
  for (let i = 0; i < toolCompletions.length - 1; i++) {
    if (!toolCompletions[i].action.success && toolCompletions[i + 1].action.success) {
      if (toolCompletions[i].action.tool === toolCompletions[i + 1].action.tool) {
        recoveries++;
      }
    }
  }
  const recoveryRate = failures.length > 0 ? recoveries / failures.length : 0;

  return {
    total_tool_calls: toolCompletions.length,
    tool_success_rate: successes.length / toolCompletions.length,
    median_duration_ms: median,
    retry_rate: retryRate,
    recovery_rate: recoveryRate,
  };
}
