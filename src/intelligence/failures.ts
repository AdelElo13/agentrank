import type { FailurePattern, FailureCategory, TaskRun, ProofEntry } from '../types.ts';

/**
 * Analyze failure patterns from task history.
 * Categorizes failures by taxonomy and tracks trends.
 */

export function analyzeFailures(
  tasks: readonly TaskRun[],
  periodDays = 30,
): readonly FailurePattern[] {
  const failedTasks = tasks.filter((t) => t.outcome === 'failed' || t.outcome === 'partial');
  if (failedTasks.length === 0) return [];

  const categoryMap = new Map<FailureCategory, { count: number; timestamps: string[] }>();

  for (const task of failedTasks) {
    const category = categorizeFailure(task);
    const existing = categoryMap.get(category);
    if (existing) {
      existing.count++;
      existing.timestamps.push(task.ended_at ?? task.started_at);
    } else {
      categoryMap.set(category, {
        count: 1,
        timestamps: [task.ended_at ?? task.started_at],
      });
    }
  }

  const now = Date.now();
  const halfPeriod = (periodDays / 2) * 24 * 60 * 60 * 1000;

  return Array.from(categoryMap.entries())
    .map(([category, data]) => {
      // Trend: compare first half vs second half of period
      const firstHalf = data.timestamps.filter(
        (ts) => now - new Date(ts).getTime() > halfPeriod,
      ).length;
      const secondHalf = data.timestamps.filter(
        (ts) => now - new Date(ts).getTime() <= halfPeriod,
      ).length;

      let trend: 'increasing' | 'stable' | 'decreasing';
      if (secondHalf > firstHalf * 1.3) trend = 'increasing';
      else if (secondHalf < firstHalf * 0.7) trend = 'decreasing';
      else trend = 'stable';

      return {
        category,
        count: data.count,
        last_seen: data.timestamps.sort().reverse()[0],
        trend,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Categorize a failed task by its failure type.
 */
export function categorizeFailure(task: TaskRun): FailureCategory {
  const evidence = task.evidence;

  // Check evidence types
  if (evidence.some((e) => e.type === 'build_fail')) return 'build_breakage';
  if (evidence.some((e) => e.type === 'test_fail')) return 'test_regression';
  if (evidence.some((e) => e.type === 'human_rejection')) return 'human_rejected';
  if (evidence.some((e) => e.type === 'rollback_triggered')) return 'rollback_triggered';
  if (evidence.some((e) => e.type === 'deployment_failed')) return 'deployment_failure';
  if (evidence.some((e) => e.type === 'regression_detected')) return 'test_regression';
  if (evidence.some((e) => e.type === 'task_abandoned')) return 'silent_abandonment';

  // Check task metadata
  if (task.state === 'abandoned') return 'silent_abandonment';
  if (task.state === 'timeout') return 'timeout';
  if (task.retries > 3) return 'flaky_fix';

  return 'unknown';
}

/**
 * Get failure summary for an agent.
 */
export function getFailureSummary(
  failures: readonly FailurePattern[],
): string {
  if (failures.length === 0) return 'No failure patterns detected.';

  const top = failures.slice(0, 3);
  const lines = top.map((f) =>
    `${f.category}: ${f.count} occurrences (${f.trend})`,
  );
  return lines.join('\n');
}
