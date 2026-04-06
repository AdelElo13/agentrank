import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.ts';
import { createMcpServer } from './server.ts';

export async function main(): Promise<void> {
  const config = loadConfig();
  const { server } = await createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Re-exports
export { createMcpServer } from './server.ts';
export { loadConfig } from './config.ts';
export { computeProfile } from './profile.ts';
export { readProofEntries, computeExecutionMetrics } from './chain-reader.ts';
export { readAllTasks, readTasksByAgent, appendTask, initStore } from './tasks/store.ts';
export { wilsonLower, computeReliability, computeWeightedReliability } from './scoring/reliability.ts';
export { computeDifficulty } from './scoring/difficulty.ts';
export { computeTrend, daysAgo } from './scoring/trend.ts';
export { classifyDomain } from './domains/classifier.ts';
export { analyzeFailures, categorizeFailure } from './intelligence/failures.ts';
export { explainProfile } from './intelligence/explain.ts';
export { computeCoverage } from './intelligence/coverage.ts';
export { evaluateCodeProofs } from './tasks/evaluators/code.ts';
export { isValidTransition, transition, isTerminal } from './tasks/state-machine.ts';
export { createSnapshot, saveSnapshot } from './snapshot.ts';
export { redactTask, redactProfile } from './privacy/redaction.ts';
export { loadOrCreateKeyPair, generateId, sha256, formatPublicKey } from './crypto/keys.ts';
export { signData, verifySignature } from './crypto/signing.ts';
export type * from './types.ts';
