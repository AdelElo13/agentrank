import { describe, it, expect } from 'vitest';
import { evaluateCodeProofs } from '../../../src/tasks/evaluators/code.ts';
import type { ProofEntry } from '../../../src/types.ts';

function makeProof(overrides: Partial<ProofEntry> = {}): ProofEntry {
  return {
    id: 'ap_test',
    sequence: 1,
    timestamp: new Date().toISOString(),
    agent_id: 'test',
    session_id: 'sess_test',
    event_type: 'tool_completed',
    action: {
      tool: 'Bash',
      input_hash: 'abc',
      output_hash: 'def',
      input_summary: 'npm test',
      success: true,
    },
    context: { origin: 'hook' },
    ...overrides,
  } as ProofEntry;
}

describe('Code Evaluator', () => {
  it('detects test_pass', () => {
    const proofs = [makeProof({ action: { ...makeProof().action, input_summary: 'npm test', success: true } })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence.some((e) => e.type === 'test_pass')).toBe(true);
    expect(result.suggestedOutcome).toBe('passed');
  });

  it('detects test_fail', () => {
    const proofs = [makeProof({ action: { ...makeProof().action, input_summary: 'npm test', success: false } })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence.some((e) => e.type === 'test_fail')).toBe(true);
    expect(result.suggestedOutcome).toBe('failed');
  });

  it('detects build_pass', () => {
    const proofs = [makeProof({ action: { ...makeProof().action, input_summary: 'npm run build', success: true } })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence.some((e) => e.type === 'build_pass')).toBe(true);
  });

  it('detects build_fail', () => {
    const proofs = [makeProof({ action: { ...makeProof().action, input_summary: 'cargo build', success: false } })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence.some((e) => e.type === 'build_fail')).toBe(true);
  });

  it('detects lint_pass', () => {
    const proofs = [makeProof({ action: { ...makeProof().action, input_summary: 'eslint src/', success: true } })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence.some((e) => e.type === 'lint_pass')).toBe(true);
  });

  it('takes last result as definitive (agent fixed failures)', () => {
    const proofs = [
      makeProof({ action: { ...makeProof().action, input_summary: 'npm test', success: false } }),
      makeProof({ action: { ...makeProof().action, input_summary: 'npm test', success: true } }),
    ];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.suggestedOutcome).toBe('passed');
  });

  it('ignores non-Bash tools', () => {
    const proofs = [makeProof({
      action: { ...makeProof().action, tool: 'Edit', input_summary: 'npm test', success: true },
    })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence).toHaveLength(0);
    expect(result.suggestedOutcome).toBe('unknown');
  });

  it('returns unknown for no code evidence', () => {
    const proofs = [makeProof({ action: { ...makeProof().action, input_summary: 'ls -la', success: true } })];
    const result = evaluateCodeProofs(proofs, '1.0');
    expect(result.evidence).toHaveLength(0);
    expect(result.suggestedOutcome).toBe('unknown');
  });
});
