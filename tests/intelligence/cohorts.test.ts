import { describe, it, expect } from 'vitest';
import { compareCohort } from '../../src/intelligence/cohorts.ts';
import type { TaskRun } from '../../src/types.ts';

function makeTask(agentId: string, domain: string, outcome: string, difficulty = 0.3): TaskRun {
  return {
    task_id: `task_${Math.random().toString(36).slice(2)}`,
    agent_id: agentId, session_id: 'sess', goal: 'test', goal_hash: 'abc',
    domain, started_at: new Date().toISOString(), state: 'evaluated',
    related_proof_ids: [], tool_calls: 5, files_touched: 2,
    lines_changed: 50, retries: 0, outcome: outcome as any,
    evidence: [], reviewer: 'automated',
    difficulty: { score: difficulty, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [], evaluator_id: 'eval', evaluator_version: '1.0',
    evaluator_signature: 'sig', redacted: false,
  };
}

describe('Cohort Comparison', () => {
  it('ranks agents within domain', () => {
    const tasks = [
      // Agent A: 4/5 passed in react
      ...Array.from({ length: 4 }, () => makeTask('agent-a', 'frontend.react', 'passed')),
      makeTask('agent-a', 'frontend.react', 'failed'),
      // Agent B: 3/5 passed in react
      ...Array.from({ length: 3 }, () => makeTask('agent-b', 'frontend.react', 'passed')),
      ...Array.from({ length: 2 }, () => makeTask('agent-b', 'frontend.react', 'failed')),
    ];

    const result = compareCohort(tasks, { domain: 'frontend.react', min_tasks: 3 });
    expect(result.total_agents).toBe(2);
    expect(result.agents[0].agent_id).toBe('agent-a');
    expect(result.agents[0].rank_in_cohort).toBe(1);
    expect(result.agents[1].rank_in_cohort).toBe(2);
  });

  it('filters by minimum tasks', () => {
    const tasks = [
      ...Array.from({ length: 5 }, () => makeTask('agent-a', 'frontend.react', 'passed')),
      makeTask('agent-b', 'frontend.react', 'passed'), // only 1 task
    ];

    const result = compareCohort(tasks, { domain: 'frontend.react', min_tasks: 3 });
    expect(result.total_agents).toBe(1);
    expect(result.agents[0].agent_id).toBe('agent-a');
  });

  it('filters by difficulty range', () => {
    const tasks = [
      ...Array.from({ length: 3 }, () => makeTask('agent-a', 'frontend.react', 'passed', 0.2)),
      ...Array.from({ length: 3 }, () => makeTask('agent-b', 'frontend.react', 'passed', 0.8)),
    ];

    const result = compareCohort(tasks, { difficulty_range: [0.5, 1.0], min_tasks: 3 });
    expect(result.total_agents).toBe(1);
    expect(result.agents[0].agent_id).toBe('agent-b');
  });

  it('computes cohort average', () => {
    const tasks = [
      ...Array.from({ length: 5 }, () => makeTask('agent-a', 'testing.unit', 'passed')),
      ...Array.from({ length: 5 }, () => makeTask('agent-b', 'testing.unit', 'passed')),
    ];

    const result = compareCohort(tasks, { domain: 'testing.unit', min_tasks: 3 });
    expect(result.cohort_avg_score).toBeGreaterThan(0);
  });

  it('handles empty cohort', () => {
    const result = compareCohort([], { domain: 'frontend.react' });
    expect(result.total_agents).toBe(0);
    expect(result.agents).toHaveLength(0);
  });
});
