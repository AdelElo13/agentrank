import { describe, it, expect } from 'vitest';
import { computeProfile } from '../src/profile.ts';
import type { TaskRun, ProofEntry, AgentRankConfig } from '../src/types.ts';

const config: AgentRankConfig = {
  dataDir: '/tmp/test', proofsDir: '/tmp/test',
  agentId: 'test-agent', decayLambda: 0.05,
  minTasks: 2, minConfidence: 10, periodDays: 30,
  scoringVersion: '1.0', domainVersion: '1.0',
  privacyMode: 'full', abandonmentTimeoutMin: 30,
  logLevel: 'error',
};

function makeTask(outcome: string, domain: string, toolCalls = 5): TaskRun {
  return {
    task_id: `task_${Math.random().toString(36).slice(2)}`,
    agent_id: 'test-agent', session_id: 'sess',
    goal: 'test', goal_hash: 'abc', domain,
    started_at: new Date(Date.now() - 86400000).toISOString(),
    ended_at: new Date().toISOString(),
    state: 'evaluated',
    related_proof_ids: [], tool_calls: toolCalls,
    files_touched: 2, lines_changed: 50, retries: 0,
    outcome: outcome as any,
    evidence: outcome === 'passed'
      ? [{ type: 'test_pass' as const, value: true, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }]
      : outcome === 'failed'
      ? [{ type: 'test_fail' as const, value: false, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }]
      : [],
    reviewer: 'automated',
    difficulty: { score: 0.3, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: toolCalls, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [{ agent_id: 'test-agent', role: 'sole', proof_ids: [], contribution_weight: 1 }],
    evaluator_id: 'eval', evaluator_version: '1.0',
    evaluator_signature: 'sig', redacted: false,
  };
}

function makeProof(success = true, tool = 'Bash'): ProofEntry {
  return {
    id: 'ap_' + Math.random().toString(36).slice(2),
    sequence: 1, timestamp: new Date().toISOString(),
    agent_id: 'test-agent', session_id: 'sess',
    event_type: 'tool_completed',
    action: { tool, input_hash: 'abc', output_hash: 'def', success, duration_ms: 100 },
    context: { origin: 'hook' },
  } as ProofEntry;
}

describe('Profile Computation', () => {
  it('computes profile from tasks and proofs', () => {
    const tasks = [
      makeTask('passed', 'frontend.react'),
      makeTask('passed', 'frontend.react'),
      makeTask('failed', 'frontend.react'),
      makeTask('passed', 'backend.node'),
      makeTask('passed', 'backend.node'),
    ];
    const proofs = Array.from({ length: 20 }, () => makeProof());

    const profile = computeProfile('test-agent', tasks, proofs, config);

    expect(profile.agent_id).toBe('test-agent');
    expect(profile.outcomes.total_tasks).toBe(5);
    expect(profile.outcomes.passed).toBe(4);
    expect(profile.outcomes.failed).toBe(1);
    expect(profile.outcomes.pass_rate.raw_rate).toBeCloseTo(0.8);
    expect(profile.outcomes.pass_rate.confidence).not.toBe('high'); // only 5 tasks
  });

  it('computes domain scores when enough tasks', () => {
    const tasks = [
      makeTask('passed', 'testing.unit'),
      makeTask('passed', 'testing.unit'),
      makeTask('failed', 'testing.unit'),
    ];
    const proofs = Array.from({ length: 10 }, () => makeProof());

    const profile = computeProfile('test-agent', tasks, proofs, config);
    expect(profile.domains.length).toBeGreaterThan(0);
    const testDomain = profile.domains.find((d) => d.domain === 'testing.unit');
    expect(testDomain).toBeDefined();
    expect(testDomain!.total_tasks).toBe(3);
  });

  it('computes streaks', () => {
    const tasks = [
      makeTask('passed', 'frontend.react'),
      makeTask('passed', 'frontend.react'),
      makeTask('passed', 'frontend.react'),
      makeTask('failed', 'frontend.react'),
      makeTask('passed', 'frontend.react'),
    ];

    const profile = computeProfile('test-agent', tasks, [], config);
    expect(profile.current_streak).toBe(1);
    expect(profile.longest_streak).toBe(3);
  });

  it('handles empty data', () => {
    const profile = computeProfile('test-agent', [], [], config);
    expect(profile.outcomes.total_tasks).toBe(0);
    expect(profile.outcomes.pass_rate.score).toBe(0);
    expect(profile.domains).toHaveLength(0);
  });

  it('computes cost metrics', () => {
    const tasks = [
      makeTask('passed', 'frontend.react', 10),
      makeTask('passed', 'frontend.react', 20),
    ];

    const profile = computeProfile('test-agent', tasks, [], config);
    expect(profile.cost.avg_tool_calls_per_passed_task).toBe(15);
  });

  it('includes failure patterns', () => {
    const tasks = [
      {
        ...makeTask('failed', 'frontend.react'),
        evidence: [{ type: 'build_fail' as const, value: false, weight: 0.9, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
      },
      {
        ...makeTask('failed', 'frontend.react'),
        evidence: [{ type: 'build_fail' as const, value: false, weight: 0.9, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
      },
    ];

    const profile = computeProfile('test-agent', tasks, [], config);
    expect(profile.failure_patterns.length).toBeGreaterThan(0);
    expect(profile.failure_patterns[0].category).toBe('build_breakage');
  });
});
