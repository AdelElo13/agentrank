import { readProofEntries, groupBySession } from './chain-reader.ts';
import { detectBoundaries, summarizeBoundary } from './tasks/boundary.ts';
import { evaluateCodeProofs } from './tasks/evaluators/code.ts';
import { evaluateCompletionProofs } from './tasks/evaluators/completion.ts';
import { computeDifficulty, estimateBlastRadius } from './scoring/difficulty.ts';
import { classifyDomain } from './domains/classifier.ts';
import { readAllTasks, appendTask } from './tasks/store.ts';
import { sha256, generateId } from './crypto/keys.ts';
import type { AgentRankConfig, EvaluatorKeyPair, TaskRun, ProofEntry, TaskState, TaskOutcome } from './types.ts';

/**
 * Auto-evaluate: read agentproofs chain, detect task boundaries,
 * evaluate each task, and append to tasks.jsonl.
 *
 * This is the bridge between agentproofs and agentrank.
 * Runs on-demand (not as a daemon) — safe to call repeatedly.
 */

export interface BridgeResult {
  readonly proofsScanned: number;
  readonly tasksCreated: number;
  readonly tasksSkipped: number;
  readonly newTasks: readonly TaskRun[];
}

export async function autoEvaluate(
  config: AgentRankConfig,
  keyPair: EvaluatorKeyPair,
): Promise<BridgeResult> {
  // Read all proofs
  const proofs = await readProofEntries(config.proofsDir);
  if (proofs.length === 0) {
    return { proofsScanned: 0, tasksCreated: 0, tasksSkipped: 0, newTasks: [] };
  }

  // Read existing tasks to avoid duplicates
  const existingTasks = await readAllTasks(config.dataDir);
  const existingProofIds = new Set<string>();
  for (const task of existingTasks) {
    for (const id of task.related_proof_ids) {
      existingProofIds.add(id);
    }
  }

  // Group proofs by session
  const sessions = groupBySession(proofs);

  const newTasks: TaskRun[] = [];
  let skipped = 0;

  for (const [sessionId, sessionProofs] of sessions) {
    // Detect task boundaries within session
    const boundaries = detectBoundaries(sessionProofs);

    for (const boundary of boundaries) {
      // Skip if we've already evaluated these proofs
      const boundaryProofIds = boundary.proofs.map((p) => p.id);
      const alreadyEvaluated = boundaryProofIds.some((id) => existingProofIds.has(id));
      if (alreadyEvaluated) {
        skipped++;
        continue;
      }

      // Skip very small boundaries (likely noise)
      const toolProofs = boundary.proofs.filter(
        (p) => p.event_type === 'tool_completed' || p.event_type === 'tool_failed',
      );
      if (toolProofs.length < 2) {
        skipped++;
        continue;
      }

      // Evaluate
      const task = await evaluateBoundary(
        boundary.proofs,
        sessionId,
        config,
        keyPair,
      );

      if (task) {
        newTasks.push(task);
        for (const id of task.related_proof_ids) {
          existingProofIds.add(id);
        }
      }
    }
  }

  return {
    proofsScanned: proofs.length,
    tasksCreated: newTasks.length,
    tasksSkipped: skipped,
    newTasks,
  };
}

async function evaluateBoundary(
  proofs: readonly ProofEntry[],
  sessionId: string,
  config: AgentRankConfig,
  keyPair: EvaluatorKeyPair,
): Promise<TaskRun | null> {
  if (proofs.length === 0) return null;

  const agentId = proofs[0].agent_id;
  const boundary = { startIndex: 0, endIndex: proofs.length - 1, proofs, confidence: 0.5, reason: '' };

  // Goal summary
  const goal = summarizeBoundary(boundary);

  // Domain classification
  const domainResult = classifyDomain(
    proofs,
    proofs[0].context.namespace,
    proofs[0].context.tags,
  );

  // Code evaluation
  const codeEval = evaluateCodeProofs(proofs, config.scoringVersion);

  // Completion evaluation
  const completionEval = evaluateCompletionProofs(proofs, config.scoringVersion, config.abandonmentTimeoutMin);

  // Combine evidence
  const allEvidence = [...codeEval.evidence, ...completionEval.evidence];

  // Determine outcome
  let outcome: TaskOutcome;
  if (completionEval.isAbandoned) {
    outcome = 'abandoned';
  } else if (codeEval.suggestedOutcome !== 'unknown') {
    outcome = codeEval.suggestedOutcome;
  } else if (completionEval.hasCompletionSignal) {
    // Completed but no code evidence — unknown quality
    outcome = 'unknown';
  } else {
    outcome = 'unknown';
  }

  // Determine state
  let state: TaskState;
  if (completionEval.isAbandoned) {
    state = 'abandoned';
  } else if (allEvidence.length > 0) {
    state = 'evaluated';
  } else {
    state = 'evaluated'; // Even without evidence, we record what we can
  }

  // Compute metrics from proofs
  const toolProofs = proofs.filter(
    (p) => p.event_type === 'tool_completed' || p.event_type === 'tool_failed',
  );
  const toolCalls = toolProofs.length;
  const uniqueFiles = new Set(proofs.map((p) => p.context.working_dir).filter(Boolean));

  // Retries: same tool+input appearing multiple times
  const toolInputs = new Map<string, number>();
  for (const p of toolProofs) {
    const key = `${p.action.tool}:${p.action.input_hash}`;
    toolInputs.set(key, (toolInputs.get(key) ?? 0) + 1);
  }
  const retries = Array.from(toolInputs.values()).filter((c) => c > 1).length;

  // Difficulty
  const difficulty = computeDifficulty({
    files_touched: uniqueFiles.size,
    lines_changed: 0, // Can't determine from proofs alone
    retries_needed: retries,
    tools_used: new Set(toolProofs.map((p) => p.action.tool).filter(Boolean)).size,
    blast_radius: 'low',
    production_proximity: false,
    cross_module: uniqueFiles.size > 3,
  });

  const task = await appendTask(config.dataDir, {
    task_id: generateId('task'),
    agent_id: agentId,
    session_id: sessionId,
    goal: config.privacyMode === 'full' ? goal : '[auto-detected]',
    goal_hash: sha256(goal),
    domain: domainResult.domain,
    started_at: proofs[0].timestamp,
    ended_at: proofs[proofs.length - 1].timestamp,
    state,
    related_proof_ids: proofs.map((p) => p.id),
    tool_calls: toolCalls,
    files_touched: uniqueFiles.size,
    lines_changed: 0,
    retries,
    outcome,
    evidence: allEvidence,
    reviewer: 'automated',
    difficulty,
    contributors: [{
      agent_id: agentId,
      role: 'sole',
      proof_ids: proofs.map((p) => p.id),
      contribution_weight: 1,
    }],
    evaluator_id: keyPair.keyId,
    evaluator_version: config.scoringVersion,
    redacted: config.privacyMode !== 'full',
  }, keyPair);

  return task;
}
