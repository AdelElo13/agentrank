import type { ReliabilityScore, Confidence } from '../types.ts';

/**
 * Wilson lower bound — conservative reliability estimate.
 *
 * Unlike raw percentage (4/4 = 100%), Wilson accounts for sample size.
 * 4/4 ≈ 0.40 Wilson score (low confidence) vs 80/100 ≈ 0.72 (high confidence).
 *
 * z = 1.96 for 95% confidence interval.
 */
export function wilsonLower(successes: number, total: number, z = 1.96): number {
  if (total === 0) return 0;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (center - spread) / denominator;
}

/**
 * Determine confidence level from sample size.
 */
export function getConfidence(sampleSize: number): Confidence {
  if (sampleSize < 10) return 'low';
  if (sampleSize < 50) return 'medium';
  return 'high';
}

/**
 * Compute a full reliability score.
 */
export function computeReliability(
  successes: number,
  total: number,
): ReliabilityScore {
  return {
    score: wilsonLower(successes, total),
    raw_rate: total > 0 ? successes / total : 0,
    confidence: getConfidence(total),
    sample_size: total,
    successes,
    failures: total - successes,
  };
}

/**
 * Recency-weighted reliability.
 * Each task is weighted by how recent it is.
 */
export function computeWeightedReliability(
  tasks: ReadonlyArray<{ success: boolean; daysAgo: number }>,
  lambda = 0.05,
): ReliabilityScore {
  if (tasks.length === 0) {
    return computeReliability(0, 0);
  }

  let weightedSuccesses = 0;
  let totalWeight = 0;

  for (const task of tasks) {
    const weight = Math.exp(-lambda * task.daysAgo);
    totalWeight += weight;
    if (task.success) weightedSuccesses += weight;
  }

  // Effective sample size (sum of weights can be fractional)
  const effectiveN = Math.round(totalWeight);
  const effectiveSuccesses = Math.round(weightedSuccesses);

  return {
    score: wilsonLower(effectiveSuccesses, effectiveN),
    raw_rate: totalWeight > 0 ? weightedSuccesses / totalWeight : 0,
    confidence: getConfidence(tasks.length), // Confidence based on actual count, not weighted
    sample_size: tasks.length,
    successes: tasks.filter((t) => t.success).length,
    failures: tasks.filter((t) => !t.success).length,
  };
}
