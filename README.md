# agentrank

Evidence-backed task evaluation, performance analytics, and failure intelligence for AI agents — derived from signed proof chains.

## The problem

Your AI agent ran 200 tool calls. `npm test` passed. Ship it?

Not so fast. Tool success does not equal task success. An agent can execute 20 "successful" tool calls and still produce broken code, miss edge cases, or silently abandon half the task.

Without evaluation: you guess. With agentrank: you know — backed by evidence, scored with statistics, and honest about confidence.

## How it works

agentrank sits on top of [agentproofs](https://github.com/AdelElo13/agentproofs) (signed proof chains) and adds:

1. **Task evaluation** — did the agent's work actually succeed? (build, test, lint, human review)
2. **Bayesian scoring** — Wilson lower bound, not naive percentages. 4/4 is NOT "100% reliable."
3. **Domain profiling** — an agent can be strong in React but weak in database migrations
4. **Failure intelligence** — what goes wrong, how often, and is it getting worse?
5. **Honest confidence** — every score includes sample size and confidence level

```
agentproofs          agentrank              output
(what happened)  ->  (did it work?)    ->  domain profiles
signed proofs        task evaluations       failure patterns
                     Bayesian scoring       confidence levels
                     evidence chain         improvement tracking
```

## Quick start

```bash
# Initialize (generates evaluator keypair)
npx agentrank init

# Log a task evaluation
npx agentrank task log --goal "Fix auth bug" --outcome passed

# See your agent's profile
npx agentrank profile

# Understand the score
npx agentrank explain

# See failure patterns
npx agentrank failures
```

## Why Bayesian scoring?

Raw percentages lie. `4/4 = 100%` looks perfect. But it could be luck.

agentrank uses the **Wilson lower bound** — a conservative estimate that accounts for sample size:

| Tasks | Raw % | Wilson Score | Confidence |
|-------|-------|-------------|------------|
| 4/4 passed | 100% | ~40% | Low (n=4) |
| 8/10 passed | 80% | ~52% | Medium (n=10) |
| 80/100 passed | 80% | ~72% | High (n=100) |

The Wilson score answers: "What's the worst this agent's true reliability could be, given the data?" That's what you want for routing decisions.

## What it evaluates

### Evidence types

| Evidence | Source | Weight |
|----------|--------|--------|
| `build_pass/fail` | `npm run build`, `cargo build` | 0.9 |
| `test_pass/fail` | `npm test`, `vitest`, `pytest` | 1.0 |
| `lint_pass/fail` | `eslint`, `ruff` | 0.5 |
| `typecheck_pass/fail` | `tsc`, `mypy` | 0.7 |
| `human_approval/rejection` | Explicit signals | 1.0 |
| `task_abandoned` | No activity timeout | 0.8 |

### Smart evaluation

- Last result wins — if tests fail then pass after a fix, outcome is **passed**
- Missing evidence lowers confidence, not score (no build/test = we don't know, not "it failed")
- Difficulty normalization — easy tasks give less credit than hard ones

## Trust boundaries

Every number has a trust level:

| Layer | What | Guarantee |
|-------|------|-----------|
| Proof chain (agentproofs) | What happened | Cryptographically tamper-evident |
| Task evaluations | Did it work? | Signed by evaluator, reproducible from proofs |
| Agent profiles | How good? | Computed from evaluations, rebuildable |

The evaluator signs task evaluations — not the agent. An agent doesn't grade its own homework.

## CLI reference

```bash
npx agentrank [command] [options]
```

| Command | Description |
|---------|-------------|
| `init` | Initialize evaluator keys and data directory |
| `profile [agent]` | Full agent profile with domain breakdown |
| `explain [agent]` | Why does this agent have this score? |
| `failures [agent]` | Failure pattern analysis |
| `tasks` | Recent task evaluations |
| `coverage` | Evaluation coverage report |
| `snapshot [--sign]` | Create signed score snapshot |
| `pubkey` | Print evaluator public key |

## MCP Server

```json
{
  "mcpServers": {
    "agentrank": {
      "command": "npx",
      "args": ["agentrank"]
    }
  }
}
```

**Tools:** `rank_agent`, `rank_explain`, `rank_failures`, `rank_task`, `rank_snapshot`, `rank_coverage`

**Resources:** `rank://overview`, `rank://tasks/recent`, `rank://coverage`

## Domain classification

Weighted multi-signal classifier detects what kind of work the agent did:

| Category | Domains |
|----------|---------|
| Frontend | react, nextjs, vue, css, typescript |
| Backend | node, python, api, database |
| Infra | devops, cloud |
| Security | auth, appsec |
| Testing | unit, e2e |
| Data | ml, analytics |

An agent gets a score per domain — not one score for everything. "Strong in React (82%, n=47)" is more useful than "Overall: 76%".

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTRANK_DATA_DIR` | `~/.agentrank/` | Data directory |
| `AGENTRANK_PROOFS_DIR` | `~/.agentproofs/` | agentproofs data directory |
| `AGENTRANK_AGENT_ID` | `claude-code` | Current agent |
| `AGENTRANK_DECAY_LAMBDA` | `0.05` | Recency decay factor |
| `AGENTRANK_PERIOD_DAYS` | `30` | Default evaluation period |
| `AGENTRANK_PRIVACY_MODE` | `full` | Privacy: full, redacted, hashes_only |

## The stack

```
agentproofs  ->  agentrank  ->  neurohive (coming)
(proof chain)    (evaluation)   (multi-agent routing)
```

Each package works independently. Together they form an agent intelligence stack where every claim is backed by evidence.

## Development

```bash
npm install
npm test          # 90 tests
npm run build
npm run typecheck
```

## License

MIT
