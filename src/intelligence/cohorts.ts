import { computeReliability } from '../scoring/reliability.ts';
import type { TaskRun, CohortFilter, CohortComparison, ReliabilityScore } from '../types.ts';

/**
 * Compare agents within a fair cohort.
 * Agents are only comparable when they've done similar work.
 */
export function compareCohort(
  tasks: readonly TaskRun[],
  filter: CohortFilter,
): CohortComparison {
  // Filter tasks to cohort
  let cohortTasks = [...tasks];

  if (filter.domain) {
    cohortTasks = cohortTasks.filter((t) => t.domain === filter.domain);
  }
  if (filter.difficulty_range) {
    const [min, max] = filter.difficulty_range;
    cohortTasks = cohortTasks.filter((t) => t.difficulty.score >= min && t.difficulty.score <= max);
  }
  if (filter.period_days) {
    const cutoff = Date.now() - filter.period_days * 24 * 60 * 60 * 1000;
    cohortTasks = cohortTasks.filter((t) => new Date(t.started_at).getTime() >= cutoff);
  }

  // Group by agent
  const byAgent = new Map<string, TaskRun[]>();
  for (const task of cohortTasks) {
    const existing = byAgent.get(task.agent_id);
    if (existing) existing.push(task);
    else byAgent.set(task.agent_id, [task]);
  }

  // Filter by minimum tasks
  const minTasks = filter.min_tasks ?? 3;
  const qualifiedAgents: Array<{ agent_id: string; score: ReliabilityScore; tasks: number }> = [];

  for (const [agentId, agentTasks] of byAgent) {
    if (agentTasks.length < minTasks) continue;

    const evaluated = agentTasks.filter((t) => t.outcome === 'passed' || t.outcome === 'failed');
    const passed = evaluated.filter((t) => t.outcome === 'passed').length;
    const score = computeReliability(passed, evaluated.length);

    qualifiedAgents.push({ agent_id: agentId, score, tasks: agentTasks.length });
  }

  // Rank by Wilson score
  qualifiedAgents.sort((a, b) => b.score.score - a.score.score);

  const avgScore = qualifiedAgents.length > 0
    ? qualifiedAgents.reduce((sum, a) => sum + a.score.score, 0) / qualifiedAgents.length
    : 0;

  return {
    cohort: filter,
    agents: qualifiedAgents.map((a, i) => ({
      agent_id: a.agent_id,
      score: a.score,
      rank_in_cohort: i + 1,
      tasks_in_cohort: a.tasks,
    })),
    total_agents: qualifiedAgents.length,
    cohort_avg_score: Math.round(avgScore * 100) / 100,
  };
}
