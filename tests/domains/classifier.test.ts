import { describe, it, expect } from 'vitest';
import { classifyDomain } from '../../src/domains/classifier.ts';
import type { ProofEntry } from '../../src/types.ts';

function makeProof(summary: string, tool = 'Bash'): ProofEntry {
  return {
    id: 'ap_test',
    sequence: 1,
    timestamp: new Date().toISOString(),
    agent_id: 'test',
    session_id: 'sess',
    event_type: 'tool_completed',
    action: {
      tool,
      input_hash: 'abc',
      output_hash: 'def',
      input_summary: summary,
      success: true,
    },
    context: { origin: 'hook' },
  } as ProofEntry;
}

describe('Domain Classifier', () => {
  it('classifies React work', () => {
    const proofs = [
      makeProof('edit src/components/UserCard.tsx', 'Edit'),
      makeProof('edit src/hooks/useAuth.ts', 'Edit'),
      makeProof('npm test -- component', 'Bash'),
    ];
    const result = classifyDomain(proofs);
    expect(result.domain).toContain('frontend');
  });

  it('classifies backend work', () => {
    const proofs = [
      makeProof('edit express route handler endpoint controller', 'Edit'),
      makeProof('fastify server middleware', 'Bash'),
    ];
    const result = classifyDomain(proofs);
    expect(result.domain).toContain('backend');
  });

  it('classifies testing work', () => {
    const proofs = [
      makeProof('vitest run', 'Bash'),
      makeProof('edit tests/auth.test.ts mock stub', 'Edit'),
    ];
    const result = classifyDomain(proofs);
    expect(result.domain).toContain('testing');
  });

  it('uses namespace as signal', () => {
    const result = classifyDomain([], 'component hook useState jsx tsx react');
    expect(result.domain).toContain('frontend');
  });

  it('uses tags as signals', () => {
    const result = classifyDomain([], undefined, ['database', 'sql', 'migration']);
    expect(result.domain).toContain('database');
  });

  it('returns unknown for no signals', () => {
    const result = classifyDomain([]);
    expect(result.domain).toBe('unknown');
  });

  it('returns confidence score', () => {
    const proofs = [makeProof('vitest run test spec mock')];
    const result = classifyDomain(proofs);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns scored alternatives', () => {
    const proofs = [makeProof('edit tsx component hook useState jsx')];
    const result = classifyDomain(proofs);
    expect(result.scores.length).toBeGreaterThan(0);
  });
});
