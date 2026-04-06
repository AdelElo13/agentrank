import { describe, it, expect } from 'vitest';
import { analyzeFailures, categorizeFailure } from '../../src/intelligence/failures.ts';
import type { TaskRun } from '../../src/types.ts';

function makeTask(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    task_id: 'task_1',
    agent_id: 'test',
    session_id: 'sess',
    goal: 'test task',
    goal_hash: 'abc',
    domain: 'testing.unit',
    started_at: new Date().toISOString(),
    state: 'evaluated',
    related_proof_ids: [],
    tool_calls: 5,
    files_touched: 2,
    lines_changed: 50,
    retries: 0,
    outcome: 'failed',
    evidence: [],
    reviewer: 'automated',
    difficulty: { score: 0.3, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [],
    evaluator_id: 'eval',
    evaluator_version: '1.0',
    evaluator_signature: 'sig',
    redacted: false,
    ...overrides,
  };
}

describe('Failure Analysis', () => {
  it('returns empty for no failures', () => {
    const tasks = [makeTask({ outcome: 'passed' })];
    expect(analyzeFailures(tasks)).toHaveLength(0);
  });

  it('categorizes build failures', () => {
    const tasks = [makeTask({
      evidence: [{ type: 'build_fail', value: false, weight: 0.9, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
    })];
    const failures = analyzeFailures(tasks);
    expect(failures[0].category).toBe('build_breakage');
  });

  it('categorizes test failures', () => {
    const tasks = [makeTask({
      evidence: [{ type: 'test_fail', value: false, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
    })];
    const failures = analyzeFailures(tasks);
    expect(failures[0].category).toBe('test_regression');
  });

  it('categorizes abandoned tasks', () => {
    const tasks = [makeTask({ state: 'abandoned', outcome: 'abandoned' })];
    // abandoned outcome isn't in failed filter, so test with 'failed'
    const tasks2 = [makeTask({
      outcome: 'failed',
      evidence: [{ type: 'task_abandoned', value: true, weight: 0.8, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
    })];
    const failures = analyzeFailures(tasks2);
    expect(failures[0].category).toBe('silent_abandonment');
  });

  it('counts occurrences', () => {
    const tasks = [
      makeTask({ task_id: '1', evidence: [{ type: 'build_fail', value: false, weight: 0.9, timestamp: new Date().toISOString(), evaluator_version: '1.0' }] }),
      makeTask({ task_id: '2', evidence: [{ type: 'build_fail', value: false, weight: 0.9, timestamp: new Date().toISOString(), evaluator_version: '1.0' }] }),
      makeTask({ task_id: '3', evidence: [{ type: 'test_fail', value: false, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }] }),
    ];
    const failures = analyzeFailures(tasks);
    expect(failures.find((f) => f.category === 'build_breakage')?.count).toBe(2);
    expect(failures.find((f) => f.category === 'test_regression')?.count).toBe(1);
  });

  it('sorts by count descending', () => {
    const tasks = [
      makeTask({ task_id: '1', evidence: [{ type: 'test_fail', value: false, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }] }),
      makeTask({ task_id: '2', evidence: [{ type: 'test_fail', value: false, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }] }),
      makeTask({ task_id: '3', evidence: [{ type: 'build_fail', value: false, weight: 0.9, timestamp: new Date().toISOString(), evaluator_version: '1.0' }] }),
    ];
    const failures = analyzeFailures(tasks);
    expect(failures[0].category).toBe('test_regression');
  });
});

describe('Failure Categorization', () => {
  it('returns unknown for no evidence', () => {
    expect(categorizeFailure(makeTask())).toBe('unknown');
  });

  it('detects flaky fix from high retries', () => {
    expect(categorizeFailure(makeTask({ retries: 5 }))).toBe('flaky_fix');
  });

  it('detects timeout', () => {
    expect(categorizeFailure(makeTask({ state: 'timeout' as any }))).toBe('timeout');
  });
});
