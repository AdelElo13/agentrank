import type { CoverageMetrics, TaskRun, TaskState } from '../types.ts';

/**
 * Compute evaluation coverage metrics.
 * Low coverage = low confidence — agents can't inflate scores
 * by only evaluating their best work.
 */
export function computeCoverage(tasks: readonly TaskRun[]): CoverageMetrics {
  const byState: Record<string, number> = {};
  let missingEvidence = 0;

  for (const task of tasks) {
    byState[task.state] = (byState[task.state] ?? 0) + 1;

    // Check if task has meaningful evidence
    const hasCodeEvidence = task.evidence.some(
      (e) => e.type.startsWith('build_') || e.type.startsWith('test_') ||
             e.type.startsWith('lint_') || e.type.startsWith('typecheck_'),
    );
    const hasHumanEvidence = task.evidence.some(
      (e) => e.type === 'human_approval' || e.type === 'human_rejection',
    );

    if (!hasCodeEvidence && !hasHumanEvidence && task.outcome !== 'abandoned') {
      missingEvidence++;
    }
  }

  const evaluated = tasks.filter(
    (t) => t.state === 'evaluated' || t.state === 'revised',
  ).length;

  return {
    total_tasks: tasks.length,
    evaluated_tasks: evaluated,
    coverage_rate: tasks.length > 0 ? evaluated / tasks.length : 0,
    missing_evidence_tasks: missingEvidence,
    tasks_by_state: byState as Record<TaskState, number>,
  };
}
