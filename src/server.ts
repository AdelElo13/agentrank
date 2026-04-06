import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadOrCreateKeyPair, generateId, sha256 } from './crypto/keys.ts';
import { readProofEntries } from './chain-reader.ts';
import { readAllTasks, readTasksByAgent, appendTask, initStore } from './tasks/store.ts';
import { computeProfile } from './profile.ts';
import { explainProfile } from './intelligence/explain.ts';
import { analyzeFailures } from './intelligence/failures.ts';
import { computeCoverage } from './intelligence/coverage.ts';
import { computeDifficulty } from './scoring/difficulty.ts';
import { classifyDomain } from './domains/classifier.ts';
import { evaluateCodeProofs } from './tasks/evaluators/code.ts';
import { createSnapshot, saveSnapshot } from './snapshot.ts';
import { redactTask } from './privacy/redaction.ts';
import { join } from 'node:path';
import type { AgentRankConfig, TaskOutcome, EvaluatorKeyPair, TaskState } from './types.ts';
import { TASK_OUTCOMES } from './types.ts';

export async function createMcpServer(config: AgentRankConfig): Promise<{
  server: McpServer;
  keyPair: EvaluatorKeyPair;
}> {
  await initStore(config.dataDir);
  const keyPair = await loadOrCreateKeyPair(join(config.dataDir, 'keys'));

  const server = new McpServer({
    name: 'agentrank',
    version: '0.1.0',
  });

  // ── rank_agent ──
  server.tool(
    'rank_agent',
    'Full agent profile with confidence intervals and domain breakdown',
    {
      agent_id: z.string().optional().describe('Agent ID (default: current)'),
      period_days: z.number().optional().describe('Period in days (default: 30)'),
    },
    async (params) => {
      const agentId = params.agent_id ?? config.agentId;
      const tasks = await readAllTasks(config.dataDir);
      const proofs = await readProofEntries(config.proofsDir, { agentId });
      const profile = computeProfile(agentId, tasks, proofs, {
        ...config,
        periodDays: params.period_days ?? config.periodDays,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(profile, null, 2) }] };
    },
  );

  // ── rank_explain ──
  server.tool(
    'rank_explain',
    'Explain why an agent has its score — full transparency',
    {
      agent_id: z.string().optional(),
    },
    async (params) => {
      const agentId = params.agent_id ?? config.agentId;
      const tasks = await readAllTasks(config.dataDir);
      const proofs = await readProofEntries(config.proofsDir, { agentId });
      const profile = computeProfile(agentId, tasks, proofs, config);
      const explanation = explainProfile(profile);
      return { content: [{ type: 'text' as const, text: JSON.stringify(explanation, null, 2) }] };
    },
  );

  // ── rank_failures ──
  server.tool(
    'rank_failures',
    'Failure pattern analysis with taxonomy',
    {
      agent_id: z.string().optional(),
      period_days: z.number().optional(),
    },
    async (params) => {
      const agentId = params.agent_id ?? config.agentId;
      const tasks = await readTasksByAgent(config.dataDir, agentId);
      const failures = analyzeFailures(tasks, params.period_days ?? config.periodDays);
      return { content: [{ type: 'text' as const, text: JSON.stringify(failures, null, 2) }] };
    },
  );

  // ── rank_task ──
  server.tool(
    'rank_task',
    'Log a task evaluation',
    {
      goal: z.string().describe('Task goal description'),
      outcome: z.enum(TASK_OUTCOMES as unknown as [string, ...string[]]).describe('Task outcome'),
      domain: z.string().optional().describe('Domain (auto-detected if not provided)'),
      proof_ids: z.array(z.string()).optional().describe('Related agentproofs entries'),
      tool_calls: z.number().optional(),
      files_touched: z.number().optional(),
      lines_changed: z.number().optional(),
      session_id: z.string().optional(),
    },
    async (params) => {
      const proofs = params.proof_ids
        ? await readProofEntries(config.proofsDir)
        : [];
      const relatedProofs = params.proof_ids
        ? proofs.filter((p) => params.proof_ids!.includes(p.id))
        : [];

      const domain = params.domain ?? classifyDomain(relatedProofs).domain;
      const codeEval = evaluateCodeProofs(relatedProofs, config.scoringVersion);

      const difficulty = computeDifficulty({
        files_touched: params.files_touched ?? 0,
        lines_changed: params.lines_changed ?? 0,
        retries_needed: 0,
        tools_used: params.tool_calls ?? 0,
        blast_radius: 'low',
        production_proximity: false,
        cross_module: false,
      });

      const task = await appendTask(config.dataDir, {
        task_id: generateId('task'),
        agent_id: config.agentId,
        session_id: params.session_id ?? generateId('sess'),
        goal: config.privacyMode === 'full' ? params.goal : '[redacted]',
        goal_hash: sha256(params.goal),
        domain,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        state: 'evaluated' as TaskState,
        related_proof_ids: params.proof_ids ?? [],
        tool_calls: params.tool_calls ?? 0,
        files_touched: params.files_touched ?? 0,
        lines_changed: params.lines_changed ?? 0,
        retries: 0,
        outcome: params.outcome as TaskOutcome,
        evidence: codeEval.evidence,
        reviewer: 'automated',
        difficulty,
        contributors: [{ agent_id: config.agentId, role: 'sole', proof_ids: params.proof_ids ?? [], contribution_weight: 1 }],
        evaluator_id: keyPair.keyId,
        evaluator_version: config.scoringVersion,
        redacted: config.privacyMode !== 'full',
      }, keyPair);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          task_id: task.task_id,
          outcome: task.outcome,
          domain: task.domain,
          evidence_count: task.evidence.length,
          signed: true,
        }, null, 2) }],
      };
    },
  );

  // ── rank_snapshot ──
  server.tool(
    'rank_snapshot',
    'Create a signed score snapshot',
    {
      agent_id: z.string().optional(),
      sign: z.boolean().optional().describe('Sign with evaluator key'),
    },
    async (params) => {
      const agentId = params.agent_id ?? config.agentId;
      const tasks = await readAllTasks(config.dataDir);
      const proofs = await readProofEntries(config.proofsDir, { agentId });
      const profile = computeProfile(agentId, tasks, proofs, config);

      const snapshot = createSnapshot(
        profile,
        keyPair.keyId,
        config.scoringVersion,
        config.scoringVersion,
        params.sign ? keyPair : undefined,
        config.privacyMode,
      );

      const path = await saveSnapshot(config.dataDir, snapshot);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          snapshot_id: snapshot.snapshot_id,
          file: path,
          signed: !!snapshot.signature,
        }, null, 2) }],
      };
    },
  );

  // ── rank_coverage ──
  server.tool(
    'rank_coverage',
    'Evaluation coverage metrics',
    {},
    async () => {
      const tasks = await readAllTasks(config.dataDir);
      const coverage = computeCoverage(tasks);
      return { content: [{ type: 'text' as const, text: JSON.stringify(coverage, null, 2) }] };
    },
  );

  // ── Resources ──

  server.resource(
    'overview',
    'rank://overview',
    { description: 'All agents with confidence levels' },
    async () => {
      const tasks = await readAllTasks(config.dataDir);
      const agents = [...new Set(tasks.map((t) => t.agent_id))];
      const proofs = await readProofEntries(config.proofsDir);
      const profiles = agents.map((id) => computeProfile(id, tasks, proofs, config));
      return {
        contents: [{
          uri: 'rank://overview',
          mimeType: 'application/json',
          text: JSON.stringify(profiles.map((p) => ({
            agent_id: p.agent_id,
            overall_score: p.overall_score,
            confidence: p.overall_confidence,
            total_tasks: p.outcomes.total_tasks,
            trend: p.trend.direction,
          })), null, 2),
        }],
      };
    },
  );

  server.resource(
    'tasks-recent',
    'rank://tasks/recent',
    { description: 'Recent task evaluations' },
    async () => {
      const tasks = await readAllTasks(config.dataDir);
      const recent = tasks.slice(-20).reverse();
      const redacted = recent.map((t) => redactTask(t, config.privacyMode));
      return {
        contents: [{
          uri: 'rank://tasks/recent',
          mimeType: 'application/json',
          text: JSON.stringify(redacted, null, 2),
        }],
      };
    },
  );

  server.resource(
    'coverage',
    'rank://coverage',
    { description: 'Evaluation coverage metrics' },
    async () => {
      const tasks = await readAllTasks(config.dataDir);
      const coverage = computeCoverage(tasks);
      return {
        contents: [{
          uri: 'rank://coverage',
          mimeType: 'application/json',
          text: JSON.stringify(coverage, null, 2),
        }],
      };
    },
  );

  return { server, keyPair };
}
