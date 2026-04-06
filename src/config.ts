import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentRankConfig, PrivacyMode } from './types.ts';

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envNum(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseFloat(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function loadConfig(): AgentRankConfig {
  const dataDir = envStr('AGENTRANK_DATA_DIR', join(homedir(), '.agentrank'));

  return {
    dataDir,
    proofsDir: envStr('AGENTRANK_PROOFS_DIR', join(homedir(), '.agentproofs')),
    agentId: envStr('AGENTRANK_AGENT_ID', 'claude-code'),
    decayLambda: envNum('AGENTRANK_DECAY_LAMBDA', 0.05),
    minTasks: envNum('AGENTRANK_MIN_TASKS', 5),
    minConfidence: envNum('AGENTRANK_MIN_CONFIDENCE', 10),
    periodDays: envNum('AGENTRANK_PERIOD_DAYS', 30),
    scoringVersion: envStr('AGENTRANK_SCORING_VERSION', '1.0'),
    domainVersion: envStr('AGENTRANK_DOMAIN_VERSION', '1.0'),
    privacyMode: envStr('AGENTRANK_PRIVACY_MODE', 'full') as PrivacyMode,
    abandonmentTimeoutMin: envNum('AGENTRANK_ABANDONMENT_TIMEOUT_MIN', 30),
    logLevel: envStr('AGENTRANK_LOG_LEVEL', 'info') as AgentRankConfig['logLevel'],
  };
}
