import { computeProfile } from '../profile.ts';
import { classifyDomain } from '../domains/classifier.ts';
import type {
  TaskRun,
  ProofEntry,
  RoutingRecommendation,
  AgentRankConfig,
  Confidence,
} from '../types.ts';

/**
 * Recommend the best agent for a given task.
 * Always includes confidence + caveats.
 */
export function recommendAgent(
  taskDescription: string,
  domainHint: string | undefined,
  tasks: readonly TaskRun[],
  proofs: readonly ProofEntry[],
  config: AgentRankConfig,
  options?: {
    readonly minReliability?: number;
    readonly minConfidence?: Confidence;
  },
): RoutingRecommendation {
  // Detect domain
  const domain = domainHint ?? classifyDomain([], taskDescription).domain;

  // Get all agents
  const agentIds = [...new Set(tasks.map((t) => t.agent_id))];

  // Score each agent for this domain
  const candidates: Array<{
    agent_id: string;
    suitability_score: number;
    confidence: Confidence;
    reasons: string[];
    risk_factors: string[];
  }> = [];

  const minReliability = options?.minReliability ?? 0.4;
  const confidencePriority: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
  const minConfidenceValue = confidencePriority[options?.minConfidence ?? 'low'];

  for (const agentId of agentIds) {
    const profile = computeProfile(agentId, tasks, proofs, config);
    const domainScore = profile.domains.find((d) => d.domain === domain);

    const reasons: string[] = [];
    const riskFactors: string[] = [];

    let suitability = 0;
    let confidence: Confidence = 'low';

    if (domainScore) {
      suitability = domainScore.score.score;
      confidence = domainScore.score.confidence;
      reasons.push(`${Math.round(suitability * 100)}% reliability in ${domain} (n=${domainScore.total_tasks})`);

      if (domainScore.trend === 'improving') {
        reasons.push('Improving trend in this domain');
        suitability += 0.05;
      }
      if (domainScore.trend === 'degrading') {
        riskFactors.push('Degrading trend in this domain');
        suitability -= 0.05;
      }
    } else {
      // No domain-specific data — use overall
      suitability = profile.outcomes.pass_rate.score;
      confidence = profile.outcomes.pass_rate.confidence;
      reasons.push(`No domain-specific data; using overall: ${Math.round(suitability * 100)}%`);
      riskFactors.push('No track record in this specific domain');
    }

    // Failure risk
    const domainFailures = profile.failure_patterns.filter((f) => f.count > 2);
    if (domainFailures.length > 0) {
      riskFactors.push(`Common failures: ${domainFailures.map((f) => f.category).join(', ')}`);
    }

    // Recovery capability
    if (profile.execution.recovery_rate > 0.5) {
      reasons.push(`Good self-recovery (${Math.round(profile.execution.recovery_rate * 100)}%)`);
    }

    // Filter by minimum requirements
    if (suitability < minReliability) continue;
    if (confidencePriority[confidence] < minConfidenceValue) continue;

    candidates.push({
      agent_id: agentId,
      suitability_score: Math.round(suitability * 100) / 100,
      confidence,
      reasons,
      risk_factors: riskFactors,
    });
  }

  // Sort by suitability (with confidence as tiebreaker)
  candidates.sort((a, b) => {
    if (Math.abs(a.suitability_score - b.suitability_score) < 0.05) {
      return confidencePriority[b.confidence] - confidencePriority[a.confidence];
    }
    return b.suitability_score - a.suitability_score;
  });

  return {
    task_description: taskDescription,
    detected_domain: domain,
    recommended_agents: candidates,
    caveat: 'This is a probabilistic suggestion based on available evidence, not a guarantee. ' +
            'Agent performance varies by task specifics, codebase familiarity, and context.',
  };
}
