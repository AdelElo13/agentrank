import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { TaskIndex } from '../../src/storage/index-db.ts';
import type { TaskRun } from '../../src/types.ts';

let tmpDir: string;
let index: TaskIndex;

function makeTask(agentId: string, domain: string, outcome: string): TaskRun {
  return {
    task_id: `task_${Math.random().toString(36).slice(2)}`,
    agent_id: agentId, session_id: 'sess', goal: 'test', goal_hash: 'abc',
    domain, started_at: new Date().toISOString(), state: 'evaluated',
    related_proof_ids: [], tool_calls: 5, files_touched: 2,
    lines_changed: 50, retries: 0, outcome: outcome as any,
    evidence: [], reviewer: 'automated',
    difficulty: { score: 0.3, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [], evaluator_id: 'eval', evaluator_version: '1.0',
    evaluator_signature: 'sig', redacted: false,
  };
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'agentrank-idx-'));
  index = new TaskIndex(tmpDir);
});

afterEach(() => {
  index.close();
});

describe('TaskIndex', () => {
  it('indexes and retrieves tasks', () => {
    index.indexTask(makeTask('agent-1', 'frontend.react', 'passed'));
    expect(index.getAgentIds()).toEqual(['agent-1']);
    expect(index.getTasksByAgent('agent-1')).toBe(1);
  });

  it('bulk indexes tasks', () => {
    const tasks = Array.from({ length: 50 }, (_, i) =>
      makeTask(`agent-${i % 3}`, 'testing.unit', i % 4 === 0 ? 'failed' : 'passed'),
    );
    index.bulkIndex(tasks);
    expect(index.getAgentIds().length).toBe(3);
  });

  it('gets domain stats', () => {
    index.indexTask(makeTask('agent-1', 'frontend.react', 'passed'));
    index.indexTask(makeTask('agent-1', 'frontend.react', 'passed'));
    index.indexTask(makeTask('agent-1', 'frontend.react', 'failed'));
    index.indexTask(makeTask('agent-1', 'backend.node', 'passed'));

    const stats = index.getDomainStats('agent-1');
    const react = stats.find((s) => s.domain === 'frontend.react');
    expect(react!.total).toBe(3);
    expect(react!.passed).toBe(2);
  });

  it('clears index', () => {
    index.indexTask(makeTask('agent-1', 'frontend.react', 'passed'));
    index.clear();
    expect(index.getAgentIds()).toHaveLength(0);
  });
});
