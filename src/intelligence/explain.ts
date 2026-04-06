import type { AgentProfile, DomainScore, ReliabilityScore } from '../types.ts';

/**
 * Generate human-readable explanation of an agent's score.
 */

export interface ScoreExplanation {
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly recommendations: readonly string[];
  readonly confidence_note: string;
}

export function explainProfile(profile: AgentProfile): ScoreExplanation {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Overall reliability
  const passRate = profile.outcomes.pass_rate;
  if (passRate.score > 0.7 && passRate.confidence !== 'low') {
    strengths.push(
      `Strong reliability: ${formatScore(passRate)} pass rate ` +
      `(${passRate.confidence} confidence, n=${passRate.sample_size})`,
    );
  } else if (passRate.score < 0.5 && passRate.sample_size > 5) {
    weaknesses.push(
      `Low reliability: ${formatScore(passRate)} pass rate ` +
      `(${passRate.sample_size} tasks evaluated)`,
    );
  }

  // Domain strengths
  const strongDomains = profile.domains.filter(
    (d) => d.score.score > 0.7 && d.score.confidence !== 'low',
  );
  for (const d of strongDomains) {
    strengths.push(
      `Strong in ${d.domain} (${formatScore(d.score)}, n=${d.total_tasks})`,
    );
  }

  // Domain weaknesses
  const weakDomains = profile.domains.filter(
    (d) => d.score.score < 0.4 && d.total_tasks >= 3,
  );
  for (const d of weakDomains) {
    weaknesses.push(
      `Weak in ${d.domain} (${formatScore(d.score)}, n=${d.total_tasks})`,
    );
  }

  // Failure patterns
  if (profile.failure_patterns.length > 0) {
    const top = profile.failure_patterns[0];
    weaknesses.push(
      `Most common failure: ${top.category} (${top.count} occurrences, ${top.trend})`,
    );
  }

  // Recovery rate
  if (profile.execution.recovery_rate > 0.6) {
    strengths.push(
      `Good self-recovery: fixes ${Math.round(profile.execution.recovery_rate * 100)}% of own errors`,
    );
  }

  // Trend
  if (profile.trend.direction === 'improving') {
    strengths.push(`Improving trend: +${profile.trend.delta_percent}% over ${profile.trend.period_days} days`);
  } else if (profile.trend.direction === 'degrading') {
    weaknesses.push(`Degrading trend: ${profile.trend.delta_percent}% over ${profile.trend.period_days} days`);
  }

  // Missing evidence
  if (profile.outcomes.missing_evidence_count > profile.outcomes.total_tasks * 0.3) {
    weaknesses.push(
      `${profile.outcomes.missing_evidence_count} tasks lack build/test evidence — lowers confidence`,
    );
    recommendations.push('Add build/test verification to more tasks for higher confidence scores.');
  }

  // Recommendations
  if (weakDomains.length > 0) {
    recommendations.push(`Consider avoiding ${weakDomains.map((d) => d.domain).join(', ')} tasks until confidence improves.`);
  }
  if (passRate.confidence === 'low') {
    recommendations.push(`Only ${passRate.sample_size} tasks evaluated — more data needed for reliable scoring.`);
  }

  const summary = buildSummary(profile);
  const confidenceNote = `Based on ${passRate.sample_size} evaluated tasks (${passRate.confidence} confidence). ` +
    `Scores use Wilson lower bound — conservative estimates that account for sample size.`;

  return { summary, strengths, weaknesses, recommendations, confidence_note: confidenceNote };
}

function formatScore(score: ReliabilityScore): string {
  return `${Math.round(score.score * 100)}%`;
}

function buildSummary(profile: AgentProfile): string {
  const { pass_rate } = profile.outcomes;
  const level = pass_rate.score > 0.7 ? 'reliable' :
    pass_rate.score > 0.4 ? 'moderate' : 'unreliable';

  const domainStr = profile.domains.length > 0
    ? profile.domains.slice(0, 2).map((d) => d.domain).join(', ')
    : 'no specific domain';

  return `${profile.agent_id}: ${level} agent (${formatScore(pass_rate)}) ` +
    `focused on ${domainStr}, ${profile.trend.direction} trend.`;
}
