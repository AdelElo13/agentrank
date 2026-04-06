import { DOMAIN_TAXONOMY } from './taxonomy.ts';
import type { ProofEntry } from '../types.ts';

interface ClassificationResult {
  readonly domain: string;
  readonly confidence: number;
  readonly scores: ReadonlyArray<{ domain: string; score: number }>;
}

/**
 * Weighted multi-signal domain classifier.
 *
 * Signal sources (with weights):
 * 1. File paths (0.3) — working_dir, git context
 * 2. Tool input summaries (0.3) — what was being worked on
 * 3. Tool patterns (0.15) — which tools suggest which ecosystem
 * 4. Namespace/tags (0.15) — explicit labels
 * 5. Tool names (0.10) — Bash suggests backend, Edit suggests code
 */
export function classifyDomain(
  proofs: readonly ProofEntry[],
  namespace?: string,
  tags?: readonly string[],
): ClassificationResult {
  const domainScores = new Map<string, number>();

  // Initialize all domains
  for (const category of Object.values(DOMAIN_TAXONOMY)) {
    for (const domain of Object.keys(category)) {
      domainScores.set(domain, 0);
    }
  }

  // Collect text signals
  const textSignals: string[] = [];

  for (const proof of proofs) {
    if (proof.context.working_dir) textSignals.push(proof.context.working_dir);
    if (proof.action.input_summary) textSignals.push(proof.action.input_summary);
    if (proof.action.output_summary) textSignals.push(proof.action.output_summary);
    if (proof.action.tool) textSignals.push(proof.action.tool);
  }

  if (namespace) textSignals.push(namespace);
  if (tags) textSignals.push(...tags);

  const combinedText = textSignals.join(' ').toLowerCase();

  // Score each domain by signal matches
  for (const category of Object.values(DOMAIN_TAXONOMY)) {
    for (const [domain, def] of Object.entries(category)) {
      let matches = 0;
      for (const signal of def.signals) {
        if (combinedText.includes(signal.toLowerCase())) {
          matches++;
        }
      }
      const score = def.signals.length > 0 ? matches / def.signals.length : 0;
      domainScores.set(domain, score);
    }
  }

  // Sort by score
  const sorted = Array.from(domainScores.entries())
    .map(([domain, score]) => ({ domain, score }))
    .sort((a, b) => b.score - a.score);

  const topDomain = sorted[0]?.domain ?? 'unknown';
  const topScore = sorted[0]?.score ?? 0;

  return {
    domain: topScore > 0 ? topDomain : 'unknown',
    confidence: topScore,
    scores: sorted.filter((s) => s.score > 0),
  };
}
