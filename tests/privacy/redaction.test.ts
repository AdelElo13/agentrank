import { describe, it, expect } from 'vitest';
import { redactTask } from '../../src/privacy/redaction.ts';
import type { TaskRun } from '../../src/types.ts';

function makeTask(): TaskRun {
  return {
    task_id: 'task_1', agent_id: 'test', session_id: 'sess',
    goal: 'Fix the login bug in auth module', goal_hash: 'abc123',
    domain: 'security.auth', started_at: new Date().toISOString(),
    state: 'evaluated',
    related_proof_ids: ['ap_1', 'ap_2'],
    tool_calls: 5, files_touched: 2, lines_changed: 50, retries: 0,
    outcome: 'passed',
    evidence: [{ type: 'test_pass', value: true, weight: 1, source_proof_id: 'ap_1', timestamp: '', evaluator_version: '1.0' }],
    reviewer: 'automated',
    difficulty: { score: 0.3, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [], evaluator_id: 'eval', evaluator_version: '1.0',
    evaluator_signature: 'sig', redacted: false,
  };
}

describe('Redaction', () => {
  it('full mode returns original', () => {
    const task = makeTask();
    const redacted = redactTask(task, 'full');
    expect(redacted.goal).toBe('Fix the login bug in auth module');
    expect(redacted.redacted).toBe(false);
  });

  it('redacted mode hides goal', () => {
    const task = makeTask();
    const redacted = redactTask(task, 'redacted');
    expect(redacted.goal).toBe('[redacted]');
    expect(redacted.redacted).toBe(true);
    // Evidence still has proof IDs
    expect(redacted.evidence[0].source_proof_id).toBe('ap_1');
  });

  it('hashes_only mode strips proof references', () => {
    const task = makeTask();
    const redacted = redactTask(task, 'hashes_only');
    expect(redacted.goal).toBe('[redacted]');
    expect(redacted.related_proof_ids).toHaveLength(0);
    expect(redacted.evidence[0].source_proof_id).toBeUndefined();
  });
});
