import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { TaskRun } from '../types.ts';

/**
 * SQLite rebuildable index for agentrank tasks.
 * Derived cache — rebuildable from tasks.jsonl.
 */

export class TaskIndex {
  private db: Database.Database;

  constructor(dataDir: string) {
    this.db = new Database(join(dataDir, 'index.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        outcome TEXT NOT NULL,
        state TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        tool_calls INTEGER NOT NULL,
        files_touched INTEGER NOT NULL,
        lines_changed INTEGER NOT NULL,
        retries INTEGER NOT NULL,
        difficulty_score REAL NOT NULL,
        reviewer TEXT NOT NULL,
        evaluator_id TEXT NOT NULL,
        evaluator_version TEXT NOT NULL
      )
    `).run();

    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_task_agent ON tasks(agent_id)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_task_domain ON tasks(domain)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_task_outcome ON tasks(outcome)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_task_state ON tasks(state)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_task_started ON tasks(started_at)').run();
  }

  indexTask(task: TaskRun): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO tasks
      (task_id, agent_id, session_id, domain, outcome, state, started_at, ended_at,
       tool_calls, files_touched, lines_changed, retries, difficulty_score,
       reviewer, evaluator_id, evaluator_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.task_id, task.agent_id, task.session_id, task.domain,
      task.outcome, task.state, task.started_at, task.ended_at ?? null,
      task.tool_calls, task.files_touched, task.lines_changed, task.retries,
      task.difficulty.score, task.reviewer, task.evaluator_id, task.evaluator_version,
    );
  }

  bulkIndex(tasks: readonly TaskRun[]): void {
    const tx = this.db.transaction(() => {
      for (const task of tasks) this.indexTask(task);
    });
    tx();
  }

  getAgentIds(): string[] {
    return (this.db.prepare('SELECT DISTINCT agent_id FROM tasks').all() as Array<{ agent_id: string }>)
      .map((r) => r.agent_id);
  }

  getTasksByAgent(agentId: string): number {
    return (this.db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE agent_id = ?').get(agentId) as { cnt: number }).cnt;
  }

  getDomainStats(agentId: string): Array<{ domain: string; total: number; passed: number }> {
    return this.db.prepare(`
      SELECT domain, COUNT(*) as total,
             SUM(CASE WHEN outcome = 'passed' THEN 1 ELSE 0 END) as passed
      FROM tasks WHERE agent_id = ? GROUP BY domain
    `).all(agentId) as Array<{ domain: string; total: number; passed: number }>;
  }

  clear(): void {
    this.db.prepare('DELETE FROM tasks').run();
  }

  close(): void {
    this.db.close();
  }
}
