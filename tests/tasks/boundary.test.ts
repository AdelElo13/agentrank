import { describe, it, expect } from 'vitest';
import { detectBoundaries, summarizeBoundary } from '../../src/tasks/boundary.ts';
import type { ProofEntry } from '../../src/types.ts';

function makeProof(
  eventType: string,
  minutesAgo: number,
  overrides: Partial<ProofEntry> = {},
): ProofEntry {
  return {
    id: `ap_${Math.random().toString(36).slice(2)}`,
    sequence: 1,
    timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    agent_id: 'test',
    session_id: 'sess_1',
    event_type: eventType as any,
    action: {
      tool: 'Bash',
      input_hash: 'abc',
      output_hash: 'def',
      input_summary: 'ls -la',
      success: true,
    },
    context: { origin: 'hook', namespace: 'default' },
    ...overrides,
  } as ProofEntry;
}

describe('Task Boundary Detection', () => {
  it('detects session boundaries', () => {
    const proofs = [
      makeProof('tool_completed', 30),
      makeProof('session_ended', 25),
      makeProof('session_started', 20),
      makeProof('tool_completed', 15),
    ];

    const boundaries = detectBoundaries(proofs);
    expect(boundaries.length).toBeGreaterThanOrEqual(2);
    // At least one boundary should be high confidence (session-based)
    expect(boundaries.some((b) => b.confidence >= 0.9)).toBe(true);
  });

  it('detects time gap boundaries', () => {
    const proofs = [
      makeProof('tool_completed', 30),
      makeProof('tool_completed', 29), // 1 min gap
      makeProof('tool_completed', 20), // 9 min gap — boundary!
      makeProof('tool_completed', 19),
    ];

    const boundaries = detectBoundaries(proofs);
    expect(boundaries.length).toBeGreaterThanOrEqual(2);
  });

  it('detects namespace change', () => {
    const proofs = [
      makeProof('tool_completed', 10, { context: { origin: 'hook', namespace: 'project-a' } }),
      makeProof('tool_completed', 9, { context: { origin: 'hook', namespace: 'project-b' } }),
    ];

    const boundaries = detectBoundaries(proofs);
    expect(boundaries.length).toBe(2);
    expect(boundaries[0].reason).toContain('namespace');
  });

  it('detects git commit as boundary', () => {
    const proofs = [
      makeProof('tool_completed', 10),
      makeProof('tool_completed', 9, {
        action: { tool: 'Bash', input_hash: 'abc', output_hash: 'def', input_summary: 'git commit -m "fix"', success: true },
      }),
      makeProof('tool_completed', 8),
    ];

    const boundaries = detectBoundaries(proofs);
    expect(boundaries.length).toBeGreaterThanOrEqual(2);
  });

  it('handles single proof', () => {
    const proofs = [makeProof('tool_completed', 5)];
    const boundaries = detectBoundaries(proofs);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].proofs).toHaveLength(1);
  });

  it('handles empty', () => {
    expect(detectBoundaries([])).toHaveLength(0);
  });
});

describe('Boundary Summarization', () => {
  it('uses input summary', () => {
    const boundary = {
      startIndex: 0, endIndex: 0,
      proofs: [makeProof('tool_completed', 5, {
        action: { tool: 'Bash', input_hash: 'abc', output_hash: 'def', input_summary: 'npm install express', success: true },
      })],
      confidence: 0.5, reason: 'test',
    };

    const summary = summarizeBoundary(boundary);
    expect(summary).toContain('npm install express');
  });

  it('falls back to tool list', () => {
    const boundary = {
      startIndex: 0, endIndex: 0,
      proofs: [makeProof('tool_completed', 5, {
        action: { tool: 'Bash', input_hash: 'abc', output_hash: 'def', success: true },
      })],
      confidence: 0.5, reason: 'test',
    };

    const summary = summarizeBoundary(boundary);
    expect(summary).toContain('Bash');
  });
});
