import type { ProofEntry } from '../types.ts';

/**
 * Task boundary detection — identifies where one task ends and another begins.
 *
 * V2 strategy: heuristic-based with confidence scoring.
 * Not perfect — explicitly honest about limitations.
 *
 * Boundary signals:
 * - session_started / session_ended = definite boundary
 * - Long gap between proofs (>5 min) = likely new task
 * - Working directory change = likely new task
 * - Namespace change = definite new task
 * - git commit = likely task completion
 */

export interface TaskBoundary {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly proofs: readonly ProofEntry[];
  readonly confidence: number; // 0-1
  readonly reason: string;
}

const GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function detectBoundaries(
  entries: readonly ProofEntry[],
): readonly TaskBoundary[] {
  if (entries.length === 0) return [];

  const boundaries: TaskBoundary[] = [];
  let currentStart = 0;

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    let isBoundary = false;
    let reason = '';
    let confidence = 0;

    // Session boundary = definite
    if (curr.event_type === 'session_started') {
      isBoundary = true;
      reason = 'new session started';
      confidence = 1.0;
    } else if (prev.event_type === 'session_ended') {
      isBoundary = true;
      reason = 'previous session ended';
      confidence = 1.0;
    }

    // Namespace change = definite
    else if (
      prev.context.namespace && curr.context.namespace &&
      prev.context.namespace !== curr.context.namespace
    ) {
      isBoundary = true;
      reason = `namespace changed: ${prev.context.namespace} → ${curr.context.namespace}`;
      confidence = 0.9;
    }

    // Long time gap = likely
    else {
      const gap = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
      if (gap > GAP_THRESHOLD_MS) {
        isBoundary = true;
        reason = `${Math.round(gap / 60000)}min gap between actions`;
        confidence = 0.6;
      }
    }

    // Working directory change = moderate signal
    if (
      !isBoundary &&
      prev.context.working_dir && curr.context.working_dir &&
      prev.context.working_dir !== curr.context.working_dir
    ) {
      isBoundary = true;
      reason = 'working directory changed';
      confidence = 0.7;
    }

    // Git commit in previous = likely task end
    if (
      !isBoundary &&
      prev.action.tool === 'Bash' &&
      prev.action.input_summary?.includes('git commit')
    ) {
      isBoundary = true;
      reason = 'git commit detected';
      confidence = 0.7;
    }

    if (isBoundary) {
      boundaries.push({
        startIndex: currentStart,
        endIndex: i - 1,
        proofs: entries.slice(currentStart, i),
        confidence,
        reason,
      });
      currentStart = i;
    }
  }

  // Final segment
  if (currentStart < entries.length) {
    boundaries.push({
      startIndex: currentStart,
      endIndex: entries.length - 1,
      proofs: entries.slice(currentStart),
      confidence: 0.5, // Unknown — could be ongoing
      reason: currentStart === 0 ? 'single task segment' : 'remaining proofs',
    });
  }

  return boundaries;
}

/**
 * Extract a task goal summary from the proofs in a boundary.
 * Best-effort: uses tool summaries and working directory.
 */
export function summarizeBoundary(boundary: TaskBoundary): string {
  const tools = new Set<string>();
  const summaries: string[] = [];

  for (const proof of boundary.proofs) {
    if (proof.action.tool) tools.add(proof.action.tool);
    if (proof.action.input_summary && !proof.action.input_summary.startsWith('[')) {
      summaries.push(proof.action.input_summary);
    }
  }

  if (summaries.length > 0) {
    // Use the most descriptive summary (longest non-command one)
    const best = summaries
      .filter((s) => s.length > 5)
      .sort((a, b) => b.length - a.length)[0];
    if (best) return best.slice(0, 100);
  }

  const toolList = [...tools].join(', ');
  return `${boundary.proofs.length} actions using ${toolList || 'unknown tools'}`;
}
