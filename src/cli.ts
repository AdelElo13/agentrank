import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { readAllTasks, readTasksByAgent, appendTask, initStore } from './tasks/store.ts';
import { readProofEntries, computeExecutionMetrics } from './chain-reader.ts';
import { computeProfile } from './profile.ts';
import { explainProfile } from './intelligence/explain.ts';
import { analyzeFailures } from './intelligence/failures.ts';
import { computeCoverage } from './intelligence/coverage.ts';
import { createSnapshot, saveSnapshot } from './snapshot.ts';
import { loadOrCreateKeyPair, formatPublicKey, generateId, sha256 } from './crypto/keys.ts';
import { computeDifficulty } from './scoring/difficulty.ts';
import { autoEvaluate } from './bridge.ts';
import type { AgentRankConfig, TaskOutcome, TaskState } from './types.ts';

// ── Helpers ──

function bold(s: string): string { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string): string { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string): string { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string): string { return `\x1b[33m${s}\x1b[0m`; }
function dim(s: string): string { return `\x1b[2m${s}\x1b[0m`; }

function pct(n: number): string { return `${Math.round(n * 100)}%`; }

// ── Commands ──

async function cmdProfile(config: AgentRankConfig, args: string[]): Promise<void> {
  const agentId = args[0] ?? config.agentId;
  const tasks = await readAllTasks(config.dataDir);
  const proofs = await readProofEntries(config.proofsDir, { agentId });
  const profile = computeProfile(agentId, tasks, proofs, config);

  if (profile.outcomes.total_tasks === 0) {
    console.log(dim('No tasks evaluated yet for ' + agentId));
    return;
  }

  console.log(bold(`Agent: ${profile.agent_id}`));
  console.log('');

  // Outcomes
  const pr = profile.outcomes.pass_rate;
  const prColor = pr.score > 0.7 ? green : pr.score > 0.4 ? yellow : red;
  console.log(bold('  Reliability'));
  console.log(`    Pass rate:  ${prColor(pct(pr.score))} (Wilson) / ${pct(pr.raw_rate)} (raw)`);
  console.log(`    Confidence: ${pr.confidence} (n=${pr.sample_size})`);
  console.log(`    Tasks:      ${profile.outcomes.passed} passed, ${profile.outcomes.failed} failed, ${profile.outcomes.partial} partial`);
  console.log('');

  // Domains
  if (profile.domains.length > 0) {
    console.log(bold('  Domain Capabilities'));
    for (const d of profile.domains) {
      const color = d.score.score > 0.7 ? green : d.score.score > 0.4 ? yellow : red;
      const arrow = d.trend === 'improving' ? ' ↑' : d.trend === 'degrading' ? ' ↓' : '';
      console.log(`    ${d.domain.padEnd(25)} ${color(pct(d.score.score))} (n=${d.total_tasks})${arrow}`);
    }
    console.log('');
  }

  // Execution
  console.log(bold('  Execution'));
  console.log(`    Tool calls: ${profile.execution.total_tool_calls}`);
  console.log(`    Success:    ${pct(profile.execution.tool_success_rate)}`);
  console.log(`    Recovery:   ${pct(profile.execution.recovery_rate)}`);
  console.log(`    Coverage:   ${pct(profile.execution.evaluation_coverage)}`);
  console.log('');

  // Trend + Streak
  const trendIcon = profile.trend.direction === 'improving' ? green('↑') :
    profile.trend.direction === 'degrading' ? red('↓') : dim('→');
  console.log(`  Trend: ${trendIcon} ${profile.trend.direction} (${profile.trend.delta_percent}%)`);
  console.log(`  Streak: ${profile.current_streak} current, ${profile.longest_streak} longest`);
}

async function cmdExplain(config: AgentRankConfig, args: string[]): Promise<void> {
  const agentId = args[0] ?? config.agentId;
  const tasks = await readAllTasks(config.dataDir);
  const proofs = await readProofEntries(config.proofsDir, { agentId });
  const profile = computeProfile(agentId, tasks, proofs, config);
  const explanation = explainProfile(profile);

  console.log(bold('Summary:') + ' ' + explanation.summary);
  console.log('');

  if (explanation.strengths.length > 0) {
    console.log(bold(green('  Strengths:')));
    for (const s of explanation.strengths) console.log(`    + ${s}`);
    console.log('');
  }

  if (explanation.weaknesses.length > 0) {
    console.log(bold(red('  Weaknesses:')));
    for (const w of explanation.weaknesses) console.log(`    - ${w}`);
    console.log('');
  }

  if (explanation.recommendations.length > 0) {
    console.log(bold(yellow('  Recommendations:')));
    for (const r of explanation.recommendations) console.log(`    → ${r}`);
    console.log('');
  }

  console.log(dim(explanation.confidence_note));
}

async function cmdFailures(config: AgentRankConfig, args: string[]): Promise<void> {
  const agentId = args[0] ?? config.agentId;
  const tasks = await readTasksByAgent(config.dataDir, agentId);
  const failures = analyzeFailures(tasks, config.periodDays);

  if (failures.length === 0) {
    console.log(green('No failure patterns detected.'));
    return;
  }

  console.log(bold('Failure Patterns'));
  for (const f of failures) {
    const trendIcon = f.trend === 'increasing' ? red('↑') :
      f.trend === 'decreasing' ? green('↓') : dim('→');
    console.log(`  ${f.category.padEnd(28)} ${f.count}x  ${trendIcon} ${f.trend}  ${dim('last: ' + f.last_seen.slice(0, 10))}`);
  }
}

async function cmdCoverage(config: AgentRankConfig): Promise<void> {
  const tasks = await readAllTasks(config.dataDir);
  const coverage = computeCoverage(tasks);

  console.log(bold('Evaluation Coverage'));
  console.log(`  Total tasks:      ${coverage.total_tasks}`);
  console.log(`  Evaluated:        ${coverage.evaluated_tasks}`);
  console.log(`  Coverage rate:    ${pct(coverage.coverage_rate)}`);
  console.log(`  Missing evidence: ${coverage.missing_evidence_tasks}`);
}

async function cmdTasks(config: AgentRankConfig, args: string[]): Promise<void> {
  let count = 10;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--recent' && args[i + 1]) count = parseInt(args[++i], 10);
  }

  const tasks = await readAllTasks(config.dataDir);
  const recent = tasks.slice(-count).reverse();

  if (recent.length === 0) {
    console.log(dim('No tasks recorded yet.'));
    return;
  }

  for (const task of recent) {
    const icon = task.outcome === 'passed' ? green('✓') :
      task.outcome === 'failed' ? red('✗') :
      task.outcome === 'partial' ? yellow('~') : dim('?');
    const goal = task.redacted ? dim('[redacted]') : task.goal.slice(0, 50);
    console.log(`  ${icon} ${task.outcome.padEnd(10)} ${task.domain.padEnd(20)} ${goal}`);
  }
}

async function cmdSnapshot(config: AgentRankConfig, args: string[]): Promise<void> {
  const signIt = args.includes('--sign');
  const agentId = config.agentId;
  const tasks = await readAllTasks(config.dataDir);
  const proofs = await readProofEntries(config.proofsDir, { agentId });
  const profile = computeProfile(agentId, tasks, proofs, config);
  const keyPair = signIt
    ? await loadOrCreateKeyPair(join(config.dataDir, 'keys'))
    : undefined;

  const snapshot = createSnapshot(
    profile,
    keyPair?.keyId ?? 'unsigned',
    config.scoringVersion,
    config.scoringVersion,
    keyPair,
    config.privacyMode,
  );

  const path = await saveSnapshot(config.dataDir, snapshot);
  console.log(green('✓') + ` Snapshot created: ${snapshot.snapshot_id}`);
  console.log(`  File: ${path}`);
  if (snapshot.signature) console.log(`  Signed: ${green('yes')}`);
}

async function cmdInit(config: AgentRankConfig): Promise<void> {
  await initStore(config.dataDir);
  const keyPair = await loadOrCreateKeyPair(join(config.dataDir, 'keys'));

  console.log(green('✓') + ' agentrank initialized');
  console.log(`  Data dir:      ${config.dataDir}`);
  console.log(`  Proofs dir:    ${config.proofsDir}`);
  console.log(`  Evaluator key: ${keyPair.keyId}`);
  console.log(`  Public key:    ${formatPublicKey(keyPair.publicKey)}`);
}

async function cmdPubkey(config: AgentRankConfig): Promise<void> {
  const keyPair = await loadOrCreateKeyPair(join(config.dataDir, 'keys'));
  console.log(formatPublicKey(keyPair.publicKey));
}

async function cmdSync(config: AgentRankConfig): Promise<void> {
  const keyPair = await loadOrCreateKeyPair(join(config.dataDir, 'keys'));
  console.log(dim('Scanning agentproofs chain...'));
  const result = await autoEvaluate(config, keyPair);

  if (result.tasksCreated === 0) {
    console.log(dim(`Scanned ${result.proofsScanned} proofs. No new tasks to evaluate.`));
    if (result.tasksSkipped > 0) {
      console.log(dim(`  (${result.tasksSkipped} already evaluated or too small)`));
    }
    return;
  }

  console.log(green('✓') + ` Synced ${bold(String(result.tasksCreated))} new task(s) from ${result.proofsScanned} proofs`);
  for (const task of result.newTasks) {
    const icon = task.outcome === 'passed' ? green('✓') :
      task.outcome === 'failed' ? red('✗') :
      task.outcome === 'abandoned' ? yellow('⊘') : dim('?');
    const goal = task.goal.slice(0, 50);
    console.log(`  ${icon} ${task.outcome.padEnd(10)} ${task.domain.padEnd(20)} ${goal}`);
  }
  if (result.tasksSkipped > 0) {
    console.log(dim(`  (${result.tasksSkipped} skipped — already evaluated or too small)`));
  }
}

async function cmdWatch(config: AgentRankConfig, args: string[]): Promise<void> {
  let intervalSec = 60;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) intervalSec = parseInt(args[++i], 10);
  }

  console.log(bold('agentrank watch') + ` — syncing every ${intervalSec}s`);
  console.log(dim(`Watching: ${config.proofsDir}`));
  console.log(dim('Press Ctrl+C to stop.\n'));

  const keyPair = await loadOrCreateKeyPair(join(config.dataDir, 'keys'));

  const tick = async () => {
    const result = await autoEvaluate(config, keyPair);
    if (result.tasksCreated > 0) {
      const now = new Date().toLocaleTimeString();
      console.log(`[${now}] ${green('✓')} Synced ${result.tasksCreated} task(s)`);
      for (const task of result.newTasks) {
        const icon = task.outcome === 'passed' ? green('✓') :
          task.outcome === 'failed' ? red('✗') : dim('?');
        console.log(`  ${icon} ${task.outcome.padEnd(10)} ${task.domain.padEnd(20)} ${task.goal.slice(0, 40)}`);
      }
    }
  };

  // Initial sync
  await tick();

  // Poll
  const interval = setInterval(tick, intervalSec * 1000);
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(dim('\nWatch stopped.'));
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

function printHelp(): void {
  console.log(`
${bold('agentrank')} — Evidence-backed evaluation and failure intelligence for AI agents

${bold('USAGE')}
  npx agentrank [command] [options]

${bold('COMMANDS')}
  ${bold('(default)')}          Start MCP server (stdio transport)
  ${bold('init')}               Initialize data directory and evaluator keys
  ${bold('profile')} [agent]    Full agent profile with domain breakdown
  ${bold('explain')} [agent]    Why does this agent have this score?
  ${bold('failures')} [agent]   Failure pattern analysis
  ${bold('tasks')}              Recent task evaluations
  ${bold('coverage')}           Evaluation coverage report
  ${bold('snapshot')}           Create score snapshot
  ${bold('pubkey')}             Print evaluator public key
  ${bold('sync')}               Auto-evaluate new proofs from agentproofs
  ${bold('watch')}              Continuously sync (poll agentproofs chain)

${bold('OPTIONS')}
  --sign             Sign snapshots with evaluator key
  --recent <n>       Number of recent tasks (default: 10)

${bold('EXAMPLES')}
  npx agentrank init
  npx agentrank profile
  npx agentrank explain
  npx agentrank failures
  npx agentrank tasks --recent 20
  npx agentrank coverage
  npx agentrank snapshot --sign
`);
}

// ── Main CLI Entry ──

export async function cli(argv: string[]): Promise<void> {
  const command = argv[0];
  const args = argv.slice(1);
  const config = loadConfig();

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  switch (command) {
    case undefined:
    case 'serve': {
      const { main } = await import('./index.ts');
      await main();
      break;
    }
    case 'init':
      await cmdInit(config);
      break;
    case 'profile':
      await cmdProfile(config, args);
      break;
    case 'explain':
      await cmdExplain(config, args);
      break;
    case 'failures':
      await cmdFailures(config, args);
      break;
    case 'tasks':
      await cmdTasks(config, args);
      break;
    case 'coverage':
      await cmdCoverage(config);
      break;
    case 'snapshot':
      await cmdSnapshot(config, args);
      break;
    case 'pubkey':
      await cmdPubkey(config);
      break;
    case 'sync':
      await cmdSync(config);
      break;
    case 'watch':
      await cmdWatch(config, args);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "npx agentrank --help" for usage.');
      process.exitCode = 1;
  }
}
