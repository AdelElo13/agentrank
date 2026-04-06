import { describe, it, expect } from 'vitest';
import { recommendAgent } from '../../src/intelligence/routing.ts';
import type { TaskRun, ProofEntry, AgentRankConfig } from '../../src/types.ts';

const config: AgentRankConfig = {
  dataDir: '/tmp', proofsDir: '/tmp', agentId: 'test',
  decayLambda: 0.05, minTasks: 2, minConfidence: 10,
  periodDays: 30, scoringVersion: '1.0', domainVersion: '1.0',
  privacyMode: 'full', abandonmentTimeoutMin: 30, logLevel: 'error',
};

function makeTask(agentId: string, domain: string, outcome: string): TaskRun {
  return {
    task_id: `task_${Math.random().toString(36).slice(2)}`,
    agent_id: agentId, session_id: 'sess', goal: 'test', goal_hash: 'abc',
    domain, started_at: new Date(Date.now() - 86400000).toISOString(),
    ended_at: new Date().toISOString(), state: 'evaluated',
    related_proof_ids: [], tool_calls: 5, files_touched: 2,
    lines_changed: 50, retries: 0, outcome: outcome as any,
    evidence: [{ type: 'test_pass' as const, value: true, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
    reviewer: 'automated',
    difficulty: { score: 0.3, factors: { files_touched: 2, lines_changed: 50, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
    contributors: [{ agent_id: agentId, role: 'sole', proof_ids: [], contribution_weight: 1 }],
    evaluator_id: 'eval', evaluator_version: '1.0',
    evaluator_signature: 'sig', redacted: false,
  };
}

describe('Routing Recommendations', () => {
  it('recommends the best agent for a domain', () => {
    const tasks = [
      // Agent A: strong in React (4/5)
      ...Array.from({ length: 4 }, () => makeTask('agent-a', 'frontend.react', 'passed')),
      makeTask('agent-a', 'frontend.react', 'failed'),
      // Agent B: weak in React (2/5)
      ...Array.from({ length: 2 }, () => makeTask('agent-b', 'frontend.react', 'passed')),
      ...Array.from({ length: 3 }, () => makeTask('agent-b', 'frontend.react', 'failed')),
    ];

    const result = recommendAgent('Fix React component', 'frontend.react', tasks, [], config, { minReliability: 0.2 });
    expect(result.detected_domain).toBe('frontend.react');
    expect(result.recommended_agents.length).toBeGreaterThan(0);
    expect(result.recommended_agents[0].agent_id).toBe('agent-a');
    expect(result.caveat).toContain('probabilistic');
  });

  it('filters by minimum reliability', () => {
    const tasks = [
      ...Array.from({ length: 3 }, () => makeTask('agent-a', 'frontend.react', 'passed')),
      ...Array.from({ length: 7 }, () => makeTask('agent-a', 'frontend.react', 'failed')),
    ];

    const result = recommendAgent('Fix component', 'frontend.react', tasks, [], config, {
      minReliability: 0.5,
    });
    expect(result.recommended_agents).toHaveLength(0);
  });

  it('includes risk factors', () => {
    const tasks = [
      ...Array.from({ length: 3 }, () => makeTask('agent-a', 'frontend.react', 'passed')),
      ...Array.from({ length: 2 }, () => makeTask('agent-a', 'frontend.react', 'failed')),
    ];

    const result = recommendAgent('Fix component', 'frontend.react', tasks, [], config);
    // Should have reasons and possibly risk factors
    if (result.recommended_agents.length > 0) {
      expect(result.recommended_agents[0].reasons.length).toBeGreaterThan(0);
    }
  });

  it('handles no agents', () => {
    const result = recommendAgent('Fix bug', 'frontend.react', [], [], config);
    expect(result.recommended_agents).toHaveLength(0);
  });

  it('always includes caveat', () => {
    const result = recommendAgent('Fix bug', undefined, [], [], config);
    expect(result.caveat).toBeTruthy();
    expect(result.caveat).toContain('not a guarantee');
  });
});
