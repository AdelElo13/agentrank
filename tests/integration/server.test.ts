import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMcpServer } from '../../src/server.ts';
import { readAllTasks, appendTask } from '../../src/tasks/store.ts';
import { computeProfile } from '../../src/profile.ts';
import { computeCoverage } from '../../src/intelligence/coverage.ts';
import { sha256, generateId } from '../../src/crypto/keys.ts';
import type { AgentRankConfig } from '../../src/types.ts';

let tmpDir: string;
let proofsDir: string;
let config: AgentRankConfig;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'agentrank-int-'));
  proofsDir = join(tmpDir, 'proofs');
  await mkdir(join(proofsDir, 'segments'), { recursive: true });

  // Seed some proofs
  const proofLines = Array.from({ length: 5 }, (_, i) => JSON.stringify({
    id: `ap_${i}`, sequence: i + 1,
    timestamp: new Date().toISOString(),
    agent_id: 'claude-code', session_id: 'sess_1',
    event_type: 'tool_completed',
    action: { tool: 'Bash', input_hash: sha256(`input-${i}`), output_hash: sha256(`output-${i}`), input_summary: i === 2 ? 'npm test' : 'ls', success: true, duration_ms: 100 },
    context: { origin: 'hook', namespace: 'test-project' },
  })).join('\n') + '\n';
  await writeFile(join(proofsDir, 'segments', '000001.jsonl'), proofLines);

  config = {
    dataDir: tmpDir, proofsDir,
    agentId: 'claude-code', decayLambda: 0.05,
    minTasks: 1, minConfidence: 10, periodDays: 30,
    scoringVersion: '1.0', domainVersion: '1.0',
    privacyMode: 'full', abandonmentTimeoutMin: 30,
    logLevel: 'error',
  };
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true });
});

describe('Integration: MCP Server', () => {
  it('creates server with evaluator key', async () => {
    const { keyPair } = await createMcpServer(config);
    expect(keyPair.keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('reads proofs from agentproofs segments', async () => {
    const { keyPair } = await createMcpServer(config);

    // Manually log a task
    const task = await appendTask(tmpDir, {
      task_id: generateId('task'),
      agent_id: 'claude-code',
      session_id: 'sess_1',
      goal: 'Run tests',
      goal_hash: sha256('Run tests'),
      domain: 'testing.unit',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      state: 'evaluated',
      related_proof_ids: ['ap_2'],
      tool_calls: 5,
      files_touched: 1,
      lines_changed: 0,
      retries: 0,
      outcome: 'passed',
      evidence: [{ type: 'test_pass', value: true, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
      reviewer: 'automated',
      difficulty: { score: 0.2, factors: { files_touched: 1, lines_changed: 0, retries_needed: 0, tools_used: 5, blast_radius: 'low', production_proximity: false, cross_module: false } },
      contributors: [{ agent_id: 'claude-code', role: 'sole', proof_ids: ['ap_2'], contribution_weight: 1 }],
      evaluator_id: keyPair.keyId,
      evaluator_version: '1.0',
      redacted: false,
    }, keyPair);

    expect(task.evaluator_signature).toBeTruthy();

    const tasks = await readAllTasks(tmpDir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].outcome).toBe('passed');
  });

  it('computes profile with tasks and proofs', async () => {
    const { keyPair } = await createMcpServer(config);

    // Log a few tasks
    for (let i = 0; i < 3; i++) {
      await appendTask(tmpDir, {
        task_id: generateId('task'),
        agent_id: 'claude-code',
        session_id: 'sess_1',
        goal: `Task ${i}`,
        goal_hash: sha256(`Task ${i}`),
        domain: 'testing.unit',
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        state: 'evaluated',
        related_proof_ids: [],
        tool_calls: 3 + i,
        files_touched: 1,
        lines_changed: 10,
        retries: 0,
        outcome: i === 2 ? 'failed' : 'passed',
        evidence: i === 2
          ? [{ type: 'test_fail', value: false, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }]
          : [{ type: 'test_pass', value: true, weight: 1, timestamp: new Date().toISOString(), evaluator_version: '1.0' }],
        reviewer: 'automated',
        difficulty: { score: 0.3, factors: { files_touched: 1, lines_changed: 10, retries_needed: 0, tools_used: 3, blast_radius: 'low', production_proximity: false, cross_module: false } },
        contributors: [{ agent_id: 'claude-code', role: 'sole', proof_ids: [], contribution_weight: 1 }],
        evaluator_id: keyPair.keyId,
        evaluator_version: '1.0',
        redacted: false,
      }, keyPair);
    }

    const tasks = await readAllTasks(tmpDir);
    const { readProofEntries } = await import('../../src/chain-reader.ts');
    const proofs = await readProofEntries(proofsDir);

    const profile = computeProfile('claude-code', tasks, proofs, config);

    expect(profile.agent_id).toBe('claude-code');
    expect(profile.outcomes.total_tasks).toBe(3);
    expect(profile.outcomes.passed).toBe(2);
    expect(profile.outcomes.failed).toBe(1);
    expect(profile.execution.total_tool_calls).toBe(5); // from proofs
  });

  it('computes coverage metrics', async () => {
    const { keyPair } = await createMcpServer(config);

    await appendTask(tmpDir, {
      task_id: generateId('task'),
      agent_id: 'claude-code',
      session_id: 'sess_1',
      goal: 'Quick fix',
      goal_hash: sha256('Quick fix'),
      domain: 'unknown',
      started_at: new Date().toISOString(),
      state: 'evaluated',
      related_proof_ids: [],
      tool_calls: 2, files_touched: 1, lines_changed: 5, retries: 0,
      outcome: 'passed',
      evidence: [], // No evidence!
      reviewer: 'none',
      difficulty: { score: 0.1, factors: { files_touched: 1, lines_changed: 5, retries_needed: 0, tools_used: 2, blast_radius: 'low', production_proximity: false, cross_module: false } },
      contributors: [],
      evaluator_id: keyPair.keyId,
      evaluator_version: '1.0',
      redacted: false,
    }, keyPair);

    const tasks = await readAllTasks(tmpDir);
    const coverage = computeCoverage(tasks);
    expect(coverage.missing_evidence_tasks).toBe(1);
  });
});
