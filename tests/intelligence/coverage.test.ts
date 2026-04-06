import { describe, it, expect } from 'vitest';
import { computeCoverage } from '../../src/intelligence/coverage.ts';
import type { TaskRun } from '../../src/types.ts';

function makeTask(state: string, evidence: any[] = []): TaskRun {
  return {
    task_id: 'task_1', agent_id: 'test', session_id: 'sess',
    goal: 'test', goal_hash: 'abc', domain: 'testing',
    started_at: new Date().toISOString(),
    state: state as any,
    related_proof_ids: [], tool_calls: 5, files_touched: 2,
    lines_changed: 50, retries: 0, outcome: 'passed', evidence,
    reviewer: 'automated',
    difficulty: { score: 0.3, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [], evaluator_id: 'eval', evaluator_version: '1.0',
    evaluator_signature: 'sig', redacted: false,
  };
}

describe('Coverage', () => {
  it('computes coverage rate', () => {
    const tasks = [
      makeTask('evaluated', [{ type: 'test_pass', value: true, weight: 1, timestamp: '', evaluator_version: '1.0' }]),
      makeTask('evaluated'),
      makeTask('active'),
    ];
    const coverage = computeCoverage(tasks);
    expect(coverage.total_tasks).toBe(3);
    expect(coverage.evaluated_tasks).toBe(2);
    expect(coverage.coverage_rate).toBeCloseTo(2 / 3);
  });

  it('counts missing evidence', () => {
    const tasks = [
      makeTask('evaluated'), // no code/human evidence
      makeTask('evaluated', [{ type: 'test_pass', value: true, weight: 1, timestamp: '', evaluator_version: '1.0' }]),
    ];
    const coverage = computeCoverage(tasks);
    expect(coverage.missing_evidence_tasks).toBe(1);
  });

  it('handles empty', () => {
    const coverage = computeCoverage([]);
    expect(coverage.total_tasks).toBe(0);
    expect(coverage.coverage_rate).toBe(0);
  });

  it('counts tasks by state', () => {
    const tasks = [
      makeTask('evaluated'),
      makeTask('evaluated'),
      makeTask('active'),
      makeTask('abandoned'),
    ];
    const coverage = computeCoverage(tasks);
    expect(coverage.tasks_by_state['evaluated']).toBe(2);
    expect(coverage.tasks_by_state['active']).toBe(1);
  });
});
