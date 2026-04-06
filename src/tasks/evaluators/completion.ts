import type { OutcomeEvidence, ProofEntry } from '../../types.ts';

/**
 * Completion evaluator — detects task completion and abandonment signals.
 */

const COMPLETION_SIGNALS = ['done', 'klaar', 'finished', 'complete', 'shipped'];
const COMMIT_SIGNALS = ['git commit', 'git push'];

export function evaluateCompletionProofs(
  proofs: readonly ProofEntry[],
  evaluatorVersion: string,
  abandonmentTimeoutMin: number,
): {
  evidence: readonly OutcomeEvidence[];
  hasCompletionSignal: boolean;
  isAbandoned: boolean;
} {
  const evidence: OutcomeEvidence[] = [];
  const now = new Date().toISOString();

  let hasCompletionSignal = false;
  let lastActivityTime: Date | null = null;

  for (const proof of proofs) {
    lastActivityTime = new Date(proof.timestamp);

    const summary = (proof.action.input_summary ?? '').toLowerCase();
    const outputSummary = (proof.action.output_summary ?? '').toLowerCase();

    // Commit/push = completion signal
    if (proof.action.tool === 'Bash' && COMMIT_SIGNALS.some((s) => summary.includes(s))) {
      hasCompletionSignal = true;
      evidence.push({
        type: 'ticket_closed',
        value: true,
        weight: 0.7,
        source_proof_id: proof.id,
        timestamp: now,
        evaluator_version: evaluatorVersion,
      });
    }

    // Explicit completion words in summaries
    if (COMPLETION_SIGNALS.some((s) => summary.includes(s) || outputSummary.includes(s))) {
      hasCompletionSignal = true;
    }

    // Session ended = potential completion or timeout
    if (proof.event_type === 'session_ended') {
      hasCompletionSignal = true;
    }
  }

  // Abandonment: no activity for N minutes and no completion signal
  const isAbandoned = !hasCompletionSignal &&
    lastActivityTime !== null &&
    (Date.now() - lastActivityTime.getTime()) > abandonmentTimeoutMin * 60 * 1000;

  if (isAbandoned) {
    evidence.push({
      type: 'task_abandoned',
      value: true,
      weight: 0.8,
      timestamp: now,
      evaluator_version: evaluatorVersion,
    });
  }

  return { evidence, hasCompletionSignal, isAbandoned };
}
