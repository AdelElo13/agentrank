import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { signData } from '../crypto/signing.ts';
import type { TaskRun, EvaluatorKeyPair } from '../types.ts';

/**
 * Append-only task store backed by signed JSONL.
 * Each line is a TaskRun, signed by the evaluator key.
 */

export async function initStore(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(dataDir, 'keys'), { recursive: true });
  await mkdir(join(dataDir, 'snapshots'), { recursive: true });
  await mkdir(join(dataDir, 'exports'), { recursive: true });
}

const tasksPath = (dataDir: string) => join(dataDir, 'tasks.jsonl');

/**
 * Append a signed task evaluation.
 */
export async function appendTask(
  dataDir: string,
  task: Omit<TaskRun, 'evaluator_signature'>,
  keyPair: EvaluatorKeyPair,
): Promise<TaskRun> {
  const taskJson = JSON.stringify(task);
  const signature = signData(taskJson, keyPair);

  const signed: TaskRun = {
    ...task,
    evaluator_signature: signature,
  };

  const line = JSON.stringify(signed) + '\n';
  await appendFile(tasksPath(dataDir), line, 'utf-8');

  return signed;
}

/**
 * Read all task evaluations.
 */
export async function readAllTasks(dataDir: string): Promise<readonly TaskRun[]> {
  const tasks: TaskRun[] = [];
  const path = tasksPath(dataDir);

  try {
    const rl = createInterface({
      input: createReadStream(path, 'utf-8'),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        tasks.push(JSON.parse(line) as TaskRun);
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return tasks;
}

/**
 * Read tasks filtered by agent.
 */
export async function readTasksByAgent(
  dataDir: string,
  agentId: string,
): Promise<readonly TaskRun[]> {
  const all = await readAllTasks(dataDir);
  return all.filter((t) => t.agent_id === agentId);
}

/**
 * Read tasks filtered by domain.
 */
export async function readTasksByDomain(
  dataDir: string,
  domain: string,
): Promise<readonly TaskRun[]> {
  const all = await readAllTasks(dataDir);
  return all.filter((t) => t.domain === domain);
}

/**
 * Get the latest task state for a task_id (handles revisions).
 */
export async function getLatestTaskState(
  dataDir: string,
  taskId: string,
): Promise<TaskRun | null> {
  const all = await readAllTasks(dataDir);
  // Last entry for this task_id wins (revisions append)
  const matching = all.filter((t) => t.task_id === taskId);
  return matching.length > 0 ? matching[matching.length - 1] : null;
}
