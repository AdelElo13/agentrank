import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { autoEvaluate } from '../../src/bridge.ts';
import { readAllTasks, initStore } from '../../src/tasks/store.ts';
import { loadOrCreateKeyPair, sha256 } from '../../src/crypto/keys.ts';
import type { AgentRankConfig, ProofEntry } from '../../src/types.ts';

let tmpDir: string;
let proofsDir: string;
let config: AgentRankConfig;

function makeProofLine(
  id: string,
  seq: number,
  eventType: string,
  tool: string,
  summary: string,
  success: boolean,
  timestamp: string,
): string {
  const entry: Partial<ProofEntry> = {
    id,
    sequence: seq,
    timestamp,
    agent_id: 'claude-code',
    session_id: 'sess_1',
    event_type: eventType as any,
    action: {
      tool,
      input_hash: sha256(summary),
      output_hash: sha256('output'),
      input_summary: summary,
      success,
      duration_ms: 100,
    },
    context: { origin: 'hook', namespace: 'test-project' },
  };
  return JSON.stringify(entry);
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'agentrank-bridge-'));
  proofsDir = join(tmpDir, 'proofs');
  await mkdir(join(proofsDir, 'segments'), { recursive: true });
  await initStore(tmpDir);

  config = {
    dataDir: tmpDir,
    proofsDir,
    agentId: 'claude-code',
    decayLambda: 0.05,
    minTasks: 1,
    minConfidence: 10,
    periodDays: 30,
    scoringVersion: '1.0',
    domainVersion: '1.0',
    privacyMode: 'full',
    abandonmentTimeoutMin: 30,
    logLevel: 'error',
  };
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true });
});

describe('Bridge: Auto-Evaluate', () => {
  it('creates tasks from proof chain', async () => {
    const now = Date.now();
    const lines = [
      makeProofLine('ap_1', 1, 'session_started', '', 'Session started', true, new Date(now - 60000).toISOString()),
      makeProofLine('ap_2', 2, 'tool_completed', 'Bash', 'npm install', true, new Date(now - 50000).toISOString()),
      makeProofLine('ap_3', 3, 'tool_completed', 'Write', 'create src/index.ts', true, new Date(now - 40000).toISOString()),
      makeProofLine('ap_4', 4, 'tool_completed', 'Bash', 'npm test', true, new Date(now - 30000).toISOString()),
      makeProofLine('ap_5', 5, 'session_ended', '', 'Session ended', true, new Date(now - 20000).toISOString()),
    ];
    await writeFile(join(proofsDir, 'segments', '000001.jsonl'), lines.join('\n') + '\n');

    const keyPair = await loadOrCreateKeyPair(join(tmpDir, 'keys'));
    const result = await autoEvaluate(config, keyPair);

    expect(result.proofsScanned).toBe(5);
    expect(result.tasksCreated).toBeGreaterThanOrEqual(1);

    const tasks = await readAllTasks(tmpDir);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].agent_id).toBe('claude-code');
    expect(tasks[0].evaluator_signature).toBeTruthy();
  });

  it('skips already-evaluated proofs on re-run', async () => {
    const now = Date.now();
    const lines = [
      makeProofLine('ap_1', 1, 'tool_completed', 'Bash', 'npm install', true, new Date(now - 50000).toISOString()),
      makeProofLine('ap_2', 2, 'tool_completed', 'Bash', 'npm test', true, new Date(now - 40000).toISOString()),
      makeProofLine('ap_3', 3, 'tool_completed', 'Write', 'write file', true, new Date(now - 30000).toISOString()),
    ];
    await writeFile(join(proofsDir, 'segments', '000001.jsonl'), lines.join('\n') + '\n');

    const keyPair = await loadOrCreateKeyPair(join(tmpDir, 'keys'));

    const first = await autoEvaluate(config, keyPair);
    expect(first.tasksCreated).toBeGreaterThanOrEqual(1);

    // Re-run — should skip already evaluated
    const second = await autoEvaluate(config, keyPair);
    expect(second.tasksCreated).toBe(0);
    expect(second.tasksSkipped).toBeGreaterThan(0);
  });

  it('handles empty proof chain', async () => {
    const keyPair = await loadOrCreateKeyPair(join(tmpDir, 'keys'));
    const result = await autoEvaluate(config, keyPair);
    expect(result.proofsScanned).toBe(0);
    expect(result.tasksCreated).toBe(0);
  });

  it('detects test evidence from proofs', async () => {
    const now = Date.now();
    const lines = [
      makeProofLine('ap_1', 1, 'tool_completed', 'Bash', 'npm install', true, new Date(now - 50000).toISOString()),
      makeProofLine('ap_2', 2, 'tool_completed', 'Bash', 'npm test', true, new Date(now - 40000).toISOString()),
      makeProofLine('ap_3', 3, 'tool_completed', 'Bash', 'npm run build', true, new Date(now - 30000).toISOString()),
    ];
    await writeFile(join(proofsDir, 'segments', '000001.jsonl'), lines.join('\n') + '\n');

    const keyPair = await loadOrCreateKeyPair(join(tmpDir, 'keys'));
    const result = await autoEvaluate(config, keyPair);

    expect(result.tasksCreated).toBeGreaterThanOrEqual(1);

    const tasks = await readAllTasks(tmpDir);
    const task = tasks[0];
    // Should have test and build evidence
    expect(task.evidence.some((e) => e.type === 'test_pass')).toBe(true);
    expect(task.evidence.some((e) => e.type === 'build_pass')).toBe(true);
    expect(task.outcome).toBe('passed');
  });

  it('detects failed tests', async () => {
    const now = Date.now();
    const lines = [
      makeProofLine('ap_1', 1, 'tool_completed', 'Bash', 'npm install', true, new Date(now - 50000).toISOString()),
      makeProofLine('ap_2', 2, 'tool_completed', 'Bash', 'npm test', false, new Date(now - 40000).toISOString()),
    ];
    await writeFile(join(proofsDir, 'segments', '000001.jsonl'), lines.join('\n') + '\n');

    const keyPair = await loadOrCreateKeyPair(join(tmpDir, 'keys'));
    const result = await autoEvaluate(config, keyPair);

    const tasks = await readAllTasks(tmpDir);
    if (tasks.length > 0) {
      expect(tasks[0].evidence.some((e) => e.type === 'test_fail')).toBe(true);
      expect(tasks[0].outcome).toBe('failed');
    }
  });
});
