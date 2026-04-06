import { computeReliability, computeWeightedReliability } from './scoring/reliability.ts';
import { computeTrend, daysAgo } from './scoring/trend.ts';
import { analyzeFailures } from './intelligence/failures.ts';
import { computeCoverage } from './intelligence/coverage.ts';
import type {
  AgentProfile,
  TaskRun,
  DomainScore,
  SpeedScore,
  CostScore,
  ReliabilityScore,
  AgentRankConfig,
  ProofEntry,
} from './types.ts';
import { computeExecutionMetrics } from './chain-reader.ts';

/**
 * Compute a full agent profile from task evaluations and proofs.
 */
export function computeProfile(
  agentId: string,
  tasks: readonly TaskRun[],
  proofs: readonly ProofEntry[],
  config: AgentRankConfig,
): AgentProfile {
  const agentTasks = tasks.filter((t) => t.agent_id === agentId);
  const agentProofs = proofs.filter((p) => p.agent_id === agentId);

  // Execution metrics from proofs
  const execution = computeExecutionMetrics(agentProofs);
  const coverage = computeCoverage(agentTasks);
  const executionWithCoverage = {
    ...execution,
    evaluation_coverage: coverage.coverage_rate,
  };

  // Outcome metrics
  const outcomes = computeOutcomes(agentTasks, config);

  // Domain scores
  const domains = computeDomainScores(agentTasks, config);

  // Speed
  const speed = computeSpeed(agentTasks);

  // Cost
  const cost = computeCost(agentTasks);

  // Trend
  const trendData = agentTasks
    .filter((t) => t.outcome !== 'unknown')
    .map((t) => ({
      timestamp: t.ended_at ?? t.started_at,
      value: t.outcome === 'passed' ? 1 : 0,
    }));
  const trend = computeTrend(trendData, config.periodDays);

  // Streaks
  const { current, longest } = computeStreaks(agentTasks);

  // Failures
  const failurePatterns = analyzeFailures(agentTasks, config.periodDays);

  // Overall score (secondary — weighted domain average)
  const overallScore = domains.length > 0
    ? domains.reduce((sum, d) => sum + d.score.score * d.total_tasks, 0) /
      domains.reduce((sum, d) => sum + d.total_tasks, 0)
    : outcomes.pass_rate.score;

  // Timestamps
  const timestamps = agentTasks.map((t) => t.started_at).sort();
  const uniqueDays = new Set(timestamps.map((t) => t.slice(0, 10)));

  return {
    agent_id: agentId,
    execution: executionWithCoverage,
    outcomes,
    domains,
    speed,
    cost,
    overall_score: Math.round(overallScore * 100) / 100,
    overall_confidence: outcomes.pass_rate.confidence,
    trend: { ...trend, period_days: config.periodDays },
    current_streak: current,
    longest_streak: longest,
    failure_patterns: failurePatterns,
    scoring_model_version: config.scoringVersion,
    first_seen: timestamps[0] ?? '',
    last_seen: timestamps[timestamps.length - 1] ?? '',
    active_days: uniqueDays.size,
  };
}

function computeOutcomes(tasks: readonly TaskRun[], config: AgentRankConfig) {
  const evaluated = tasks.filter(
    (t) => t.state === 'evaluated' || t.state === 'revised',
  );

  const passed = evaluated.filter((t) => t.outcome === 'passed').length;
  const failed = evaluated.filter((t) => t.outcome === 'failed').length;
  const partial = evaluated.filter((t) => t.outcome === 'partial').length;
  const abandoned = tasks.filter((t) => t.outcome === 'abandoned').length;
  const unknown = evaluated.filter((t) => t.outcome === 'unknown').length;

  // Recency-weighted pass rate
  const weightedTasks = evaluated
    .filter((t) => t.outcome === 'passed' || t.outcome === 'failed')
    .map((t) => ({
      success: t.outcome === 'passed',
      daysAgo: daysAgo(t.ended_at ?? t.started_at),
    }));

  const passRate = computeWeightedReliability(weightedTasks, config.decayLambda);

  const missingEvidence = evaluated.filter((t) => {
    return !t.evidence.some((e) =>
      e.type.startsWith('build_') || e.type.startsWith('test_') ||
      e.type === 'human_approval' || e.type === 'human_rejection',
    );
  }).length;

  return {
    total_tasks: tasks.length,
    passed,
    failed,
    partial,
    abandoned,
    unknown,
    pass_rate: passRate,
    incident_rate: 0, // TODO: track incidents in v2
    missing_evidence_count: missingEvidence,
  };
}

function computeDomainScores(
  tasks: readonly TaskRun[],
  config: AgentRankConfig,
): readonly DomainScore[] {
  const byDomain = new Map<string, TaskRun[]>();

  for (const task of tasks) {
    if (task.domain === 'unknown') continue;
    const existing = byDomain.get(task.domain);
    if (existing) existing.push(task);
    else byDomain.set(task.domain, [task]);
  }

  const scores: DomainScore[] = [];

  for (const [domain, domainTasks] of byDomain) {
    if (domainTasks.length < config.minTasks) continue;

    const evaluated = domainTasks.filter(
      (t) => t.outcome === 'passed' || t.outcome === 'failed',
    );
    const score = computeReliability(
      evaluated.filter((t) => t.outcome === 'passed').length,
      evaluated.length,
    );

    const avgDifficulty = domainTasks.reduce((sum, t) => sum + t.difficulty.score, 0) / domainTasks.length;

    const trendData = domainTasks
      .filter((t) => t.outcome !== 'unknown')
      .map((t) => ({
        timestamp: t.ended_at ?? t.started_at,
        value: t.outcome === 'passed' ? 1 : 0,
      }));
    const trend = computeTrend(trendData, config.periodDays);

    scores.push({
      domain,
      score,
      total_tasks: domainTasks.length,
      avg_difficulty: Math.round(avgDifficulty * 100) / 100,
      trend: trend.direction,
    });
  }

  return scores.sort((a, b) => b.total_tasks - a.total_tasks);
}

function computeSpeed(tasks: readonly TaskRun[]): SpeedScore {
  const passedWithDuration = tasks.filter(
    (t) => t.outcome === 'passed' && t.ended_at,
  );

  if (passedWithDuration.length === 0) {
    return {
      rating: 0,
      avg_duration_ms: 0,
      p50_duration_ms: 0,
      p95_duration_ms: 0,
      context: 'No passed tasks with duration data',
      comparable_sample: 0,
    };
  }

  const durations = passedWithDuration.map((t) => {
    const start = new Date(t.started_at).getTime();
    const end = new Date(t.ended_at!).getTime();
    return end - start;
  }).sort((a, b) => a - b);

  const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];

  return {
    rating: 0, // Relative rating requires cohort comparison
    avg_duration_ms: Math.round(avg),
    p50_duration_ms: p50,
    p95_duration_ms: p95,
    context: `Based on ${durations.length} passed tasks`,
    comparable_sample: durations.length,
  };
}

function computeCost(tasks: readonly TaskRun[]): CostScore {
  const passed = tasks.filter((t) => t.outcome === 'passed');
  if (passed.length === 0) {
    return {
      rating: 0,
      avg_tool_calls_per_passed_task: 0,
      quality_adjusted_efficiency: 0,
      context: 'No passed tasks',
    };
  }

  const avgToolCalls = passed.reduce((s, t) => s + t.tool_calls, 0) / passed.length;
  const efficiency = 1 / Math.max(avgToolCalls, 1); // Inverse: fewer calls = more efficient

  return {
    rating: 0,
    avg_tool_calls_per_passed_task: Math.round(avgToolCalls * 10) / 10,
    quality_adjusted_efficiency: Math.round(efficiency * 1000) / 1000,
    context: `Based on ${passed.length} passed tasks`,
  };
}

function computeStreaks(tasks: readonly TaskRun[]): { current: number; longest: number } {
  const outcomes = tasks
    .filter((t) => t.outcome === 'passed' || t.outcome === 'failed')
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((t) => t.outcome === 'passed');

  let current = 0;
  let longest = 0;
  let streak = 0;

  for (const success of outcomes) {
    if (success) {
      streak++;
      longest = Math.max(longest, streak);
    } else {
      streak = 0;
    }
  }
  current = streak;

  return { current, longest };
}
