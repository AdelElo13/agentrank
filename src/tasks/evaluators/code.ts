import type { OutcomeEvidence, ProofEntry, TaskOutcome } from '../../types.ts';

/**
 * Code evaluator — derives build/test/lint/typecheck evidence from proofs.
 *
 * Runs inline (with access to tool summaries), not after-the-fact on hashes.
 * Requires agentproofs privacy level >= 1 (summaries) for best results.
 */

const BUILD_COMMANDS = ['npm run build', 'cargo build', 'go build', 'make', 'gradle build', 'mvn compile'];
const TEST_COMMANDS = ['npm test', 'vitest', 'jest', 'pytest', 'cargo test', 'go test'];
const LINT_COMMANDS = ['eslint', 'npm run lint', 'ruff', 'clippy', 'golint'];
const TYPECHECK_COMMANDS = ['tsc', 'typecheck', 'mypy', 'pyright'];

function matchesAny(text: string, patterns: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

export function evaluateCodeProofs(
  proofs: readonly ProofEntry[],
  evaluatorVersion: string,
): {
  evidence: readonly OutcomeEvidence[];
  suggestedOutcome: TaskOutcome;
} {
  const evidence: OutcomeEvidence[] = [];
  const now = new Date().toISOString();

  for (const proof of proofs) {
    if (proof.event_type !== 'tool_completed' && proof.event_type !== 'tool_failed') continue;

    const summary = proof.action.input_summary ?? '';
    const outputSummary = proof.action.output_summary ?? '';
    const tool = proof.action.tool ?? '';

    // Only analyze Bash commands (where builds/tests run)
    if (tool !== 'Bash') continue;

    // Build detection
    if (matchesAny(summary, BUILD_COMMANDS)) {
      evidence.push({
        type: proof.action.success ? 'build_pass' : 'build_fail',
        value: proof.action.success,
        weight: 0.9,
        source_proof_id: proof.id,
        timestamp: now,
        evaluator_version: evaluatorVersion,
      });
    }

    // Test detection
    if (matchesAny(summary, TEST_COMMANDS)) {
      evidence.push({
        type: proof.action.success ? 'test_pass' : 'test_fail',
        value: proof.action.success,
        weight: 1.0,
        source_proof_id: proof.id,
        timestamp: now,
        evaluator_version: evaluatorVersion,
      });
    }

    // Lint detection
    if (matchesAny(summary, LINT_COMMANDS)) {
      evidence.push({
        type: proof.action.success ? 'lint_pass' : 'lint_fail',
        value: proof.action.success,
        weight: 0.5,
        source_proof_id: proof.id,
        timestamp: now,
        evaluator_version: evaluatorVersion,
      });
    }

    // Typecheck detection
    if (matchesAny(summary, TYPECHECK_COMMANDS)) {
      evidence.push({
        type: proof.action.success ? 'typecheck_pass' : 'typecheck_fail',
        value: proof.action.success,
        weight: 0.7,
        source_proof_id: proof.id,
        timestamp: now,
        evaluator_version: evaluatorVersion,
      });
    }
  }

  // Determine suggested outcome from evidence
  const suggestedOutcome = deriveOutcome(evidence);

  return { evidence, suggestedOutcome };
}

function deriveOutcome(evidence: readonly OutcomeEvidence[]): TaskOutcome {
  if (evidence.length === 0) return 'unknown';

  const hasFail = evidence.some((e) =>
    e.type === 'build_fail' || e.type === 'test_fail',
  );
  const hasPass = evidence.some((e) =>
    e.type === 'build_pass' || e.type === 'test_pass',
  );

  // Take the LAST build/test result as definitive (agent may have fixed failures)
  const buildTests = evidence.filter((e) =>
    e.type.startsWith('build_') || e.type.startsWith('test_'),
  );

  if (buildTests.length === 0) return 'unknown';

  const lastResult = buildTests[buildTests.length - 1];
  if (lastResult.value === true) return 'passed';
  if (lastResult.value === false) return 'failed';

  return 'unknown';
}
