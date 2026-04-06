# AgentRank — Architecture Plan v4 (Final)

## One-liner

Evidence-backed task evaluation, performance analytics, and routing intelligence for AI agents — derived from signed proof chains.

## Problem

AI agents perform work, but nobody can answer:
- Which agent should handle this task?
- Is this agent getting better or worse?
- What are this agent's blind spots?
- Should this agent be allowed to deploy to production?

Tool success ≠ task success. An agent can execute 20 tool calls "successfully" and still produce broken code. Without task-level evaluation, outcome evidence, and trust boundaries, any scoring system is cosmetic.

The EU AI Act Article 13 (effective August 2, 2026) mandates automatic recording of events and traceability for high-risk AI systems. AgentRank provides the evaluation layer that turns raw event logs into actionable intelligence.

## Core Insight

```
agentproofs     →  task evaluation  →  scoring + routing  →  neurohive
(what happened)    (did it work?)      (how good? who next?)  (team routing)
```

AgentRank is NOT a rating system first. It is an **evaluation system** that produces ratings as a byproduct. Without evaluation, ranking is misleading. Without confidence, ranking is dangerous. Without cohorts, ranking is unfair. Without task truth, the rest is schijnprecisie.

---

## Trust Boundaries

This is the most critical section. Every consumer of AgentRank data must understand what each layer guarantees.

| Layer | Source | Trust Level | Guarantee |
|-------|--------|-------------|-----------|
| **Proof chain** (agentproofs) | Signed, hash-chained, append-only | **Primary evidence** | Cryptographically tamper-evident. If the chain verifies, these events happened in this order. |
| **Task evaluations** (tasks.jsonl) | Derived from proofs + evaluator rules | **Derived judgment** | Reproducible from proofs + evaluator version. Signed by evaluator, not agent. Can be re-evaluated with different rules. |
| **Agent profiles** | Computed from task evaluations | **Computed artifact** | Deterministic output of scoring model version + task data. Rebuildable from scratch. |
| **Routing recommendations** | Probabilistic inference from profiles | **Probabilistic suggestion** | Not a guarantee. "Based on available evidence, this agent is likely the best fit." Always includes confidence + caveats. |

**Rule:** Each layer is only as trustworthy as the layer below it. Profiles are meaningless if task evaluations are wrong. Task evaluations are meaningless if proofs are tampered with.

### tasks.jsonl Trust Model

Task evaluations are NOT a loose cache. They are append-only records with:
- **Evaluator signature** — signed by the evaluator key (separate from agent key)
- **Evaluator version** — which rules produced this evaluation
- **Evidence chain** — links to specific proof IDs that justify the outcome
- **Reproducibility** — given the same proofs + same evaluator version, the same evaluation MUST be produced

```typescript
interface SignedTaskEvaluation extends TaskRun {
  evaluator_id: string;           // Which evaluator produced this
  evaluator_version: string;      // Which version of evaluation rules
  evaluator_signature: string;    // Ed25519 signature by evaluator key
  reproducible: boolean;          // Can this be re-derived from proofs alone?
}
```

---

## Three Metric Layers (never conflate)

### Layer 1: Execution Metrics (from agentproofs)
Raw signals from the proof chain. No judgment, just facts.
- Tool success rate
- Median duration
- Retry rate
- Failure rate
- Recovery rate (fixed own errors)

### Layer 2: Outcome Metrics (from task evaluations)
Evidence-based task results. Requires judgment.
- Task pass rate (Bayesian, with confidence)
- Post-task regressions
- Human acceptance rate
- Incident rate
- Rollback rate
- Evaluation coverage (% of work that was evaluated)

### Layer 3: Reputation Metrics (computed)
Derived from layers 1+2. Always includes confidence.
- Domain capability profile
- Routing recommendation
- Trust band
- Confidence interval

---

## Data Model

### TaskRun — the core evaluation unit

```typescript
interface TaskRun {
  task_id: string;
  agent_id: string;
  session_id: string;

  // What
  goal: string;                   // Human-readable (redactable)
  goal_hash: string;              // SHA-256 of original goal (privacy)
  domain: string;                 // e.g., "frontend.react"

  // When
  started_at: string;
  ended_at?: string;

  // How
  related_proof_ids: string[];
  tool_calls: number;
  files_touched: number;
  lines_changed: number;
  retries: number;

  // Result
  outcome: TaskOutcome;
  evidence: OutcomeEvidence[];
  reviewer: 'human' | 'automated' | 'hybrid' | 'none';

  // Difficulty
  difficulty: TaskDifficulty;

  // Multi-agent attribution
  contributors: Contributor[];

  // Trust
  evaluator_id: string;
  evaluator_version: string;
  evaluator_signature: string;

  // Privacy
  redacted: boolean;              // If true, goal is hash-only
}

type TaskOutcome = 'passed' | 'failed' | 'partial' | 'abandoned' | 'unknown';
```

### Task State Machine

Tasks follow a strict lifecycle. No ad-hoc state transitions.

```
                    ┌──────────┐
                    │  CREATED │
                    └────┬─────┘
                         │ first proof logged
                         ▼
                    ┌──────────┐
              ┌─────│  ACTIVE  │─────┐
              │     └────┬─────┘     │
              │          │           │
         abandon    complete    session_end
              │          │           │
              ▼          ▼           ▼
        ┌──────────┐ ┌─────────┐ ┌──────────┐
        │ABANDONED │ │EVALUATING│ │ TIMEOUT  │
        └──────────┘ └────┬────┘ └────┬─────┘
                          │           │
                     evidence     auto-eval
                     collected    attempted
                          │           │
                          ▼           ▼
                    ┌──────────────────┐
                    │    EVALUATED     │
                    │ (passed/failed/  │
                    │  partial/unknown)│
                    └────────┬────────┘
                             │
                        regression
                        detected?
                             │
                             ▼
                    ┌──────────────────┐
                    │  REVISED         │
                    │ (outcome changed │
                    │  retroactively)  │
                    └──────────────────┘
```

Valid transitions:
- `CREATED → ACTIVE` (first proof)
- `ACTIVE → ABANDONED` (no activity for N minutes + no completion signal)
- `ACTIVE → EVALUATING` (completion signal: commit, explicit "done", goal met)
- `ACTIVE → TIMEOUT` (session ends without completion signal)
- `EVALUATING → EVALUATED` (evidence collected, outcome determined)
- `TIMEOUT → EVALUATED` (auto-evaluation attempted)
- `EVALUATED → REVISED` (regression detected within 24h, or human override)

**No other transitions are valid.** This prevents gaming through state manipulation.

### OutcomeEvidence — ground truth

```typescript
interface OutcomeEvidence {
  type: EvidenceType;
  value: boolean | number | string;
  weight: number;                  // 0-1, how much this matters
  source_proof_id?: string;        // Link to agentproofs entry
  timestamp: string;
  evaluator_version: string;       // Which evaluator rule produced this
}

type EvidenceType =
  // Code quality
  | 'build_pass' | 'build_fail'
  | 'test_pass' | 'test_fail'
  | 'lint_pass' | 'lint_fail'
  | 'typecheck_pass' | 'typecheck_fail'
  // Human judgment
  | 'human_approval' | 'human_rejection'
  // Deployment
  | 'deployment_healthy' | 'deployment_failed'
  | 'rollback_triggered'
  // Incidents
  | 'incident_created' | 'no_regression_24h' | 'regression_detected'
  // Task lifecycle
  | 'task_abandoned' | 'ticket_closed' | 'ticket_reopened'
  // Custom (plugin evaluators)
  | 'custom';
```

### TaskDifficulty

Difficulty comes from the task context, NOT from action type.

```typescript
interface TaskDifficulty {
  score: number;                   // 0-1, computed from factors
  factors: {
    files_touched: number;
    lines_changed: number;
    dependencies_involved: number;
    retries_needed: number;
    tools_used: number;
    blast_radius: 'low' | 'medium' | 'high';
    production_proximity: boolean;
    approval_required: boolean;
    test_surface: number;
    cross_module: boolean;         // Touches multiple modules/packages
  };
}
```

### Contributor — multi-agent attribution

For neurohive and multi-agent setups. Who did what in a task.

```typescript
interface Contributor {
  agent_id: string;
  public_key?: string;            // From agentproofs identity
  role: ContributorRole;
  proof_ids: string[];            // Which proofs this agent produced
  contribution_weight: number;    // 0-1, how much credit/blame
}

type ContributorRole =
  | 'planner'       // Designed the approach
  | 'executor'      // Did the main work
  | 'reviewer'      // Reviewed the work
  | 'tester'        // Tested the output
  | 'fixer'         // Fixed issues found by others
  | 'deployer'      // Deployed to production
  | 'sole';         // Did everything (single-agent)
```

Credit/blame distribution:
- **Passed task:** credit distributed by `contribution_weight`
- **Failed task:** blame weighted toward `executor` and `deployer`, less toward `reviewer`
- **Partial task:** proportional distribution based on which parts passed/failed

---

## Evaluator System

### Plugin-based evaluators

AgentRank is NOT just a code evaluator. Different task types need different evidence.

```typescript
interface Evaluator {
  id: string;
  version: string;
  domains: string[];              // Which domains this evaluator handles
  evaluate(proofs: ProofEntry[], context: TaskContext): OutcomeEvidence[];
}
```

### Built-in evaluators

| Evaluator | Domains | Evidence it produces |
|-----------|---------|---------------------|
| **CodeEvaluator** | frontend.*, backend.*, testing.* | build_pass/fail, test_pass/fail, lint_pass/fail, typecheck |
| **DeployEvaluator** | infra.* | deployment_healthy/failed, rollback, no_regression_24h |
| **HumanEvaluator** | all | human_approval/rejection (from explicit signals) |
| **CompletionEvaluator** | all | task_abandoned, ticket_closed/reopened |

### Evaluator provenance

Every evaluation records:
- Which evaluator produced it (`evaluator_id`)
- Which version (`evaluator_version`)
- Which evidence rules were applied
- Confidence of the evaluation
- Whether a human overruled the automated judgment

```typescript
interface EvaluatorProvenance {
  evaluator_id: string;
  evaluator_version: string;
  policy_version: string;         // Which ruleset was applied
  confidence: 'low' | 'medium' | 'high';
  human_override: boolean;        // Did a human change the outcome?
  human_override_reason?: string;
  reproducible_from_proofs: boolean;
}
```

---

## Domain Taxonomy

Hierarchical, not flat. Weighted classifier, not single heuristic.

```typescript
const DOMAIN_TAXONOMY = {
  'frontend': {
    'frontend.react': { signals: ['tsx', 'jsx', 'component', 'hook', 'context', 'useState'] },
    'frontend.nextjs': { signals: ['next.config', 'app/', 'pages/', 'middleware', 'getServerSide'] },
    'frontend.vue': { signals: ['vue', 'nuxt', 'composable', 'ref('] },
    'frontend.css': { signals: ['tailwind', 'css', 'scss', 'styled', 'className'] },
    'frontend.typescript': { signals: ['.ts', 'type ', 'interface ', 'generic', 'as const'] },
  },
  'backend': {
    'backend.node': { signals: ['express', 'fastify', 'koa', 'server.ts', 'middleware'] },
    'backend.python': { signals: ['.py', 'django', 'flask', 'fastapi', 'def ', 'import '] },
    'backend.api': { signals: ['route', 'endpoint', 'controller', 'handler', 'REST'] },
    'backend.database': { signals: ['sql', 'migration', 'schema', 'query', 'supabase', 'prisma'] },
  },
  'infra': {
    'infra.devops': { signals: ['docker', 'ci', 'cd', 'pipeline', 'deploy', 'github-actions'] },
    'infra.kubernetes': { signals: ['k8s', 'helm', 'pod', 'service', 'kubectl'] },
    'infra.cloud': { signals: ['aws', 'gcp', 'azure', 'vercel', 'netlify', 'terraform'] },
  },
  'security': {
    'security.auth': { signals: ['auth', 'oauth', 'jwt', 'session', 'login', 'signup'] },
    'security.appsec': { signals: ['xss', 'csrf', 'injection', 'sanitize', 'vulnerability'] },
  },
  'testing': {
    'testing.unit': { signals: ['test', 'spec', 'mock', 'stub', 'vitest', 'jest', 'pytest'] },
    'testing.e2e': { signals: ['playwright', 'cypress', 'selenium', 'e2e'] },
    'testing.qa': { signals: ['coverage', 'regression', 'smoke', 'benchmark'] },
  },
  'data': {
    'data.ml': { signals: ['model', 'train', 'predict', 'tensor', 'pytorch', 'sklearn'] },
    'data.analytics': { signals: ['chart', 'graph', 'dashboard', 'metric', 'pandas'] },
  },
} as const;
```

Domain detection uses weighted signals from:
1. File paths in working directory (weight: 0.3)
2. Changed files from proof context (weight: 0.3)
3. Tool patterns — npm = JS ecosystem (weight: 0.15)
4. Namespace/project tags (weight: 0.1)
5. Explicit task labels (weight: 0.1)
6. Evaluator outcomes (weight: 0.05)

Not one weak heuristic — a weighted classifier with confidence output.

---

## Scoring Model

### Reliability — Bayesian, not percentage

Raw percentages lie. 4/4 is not "100% reliable."

```typescript
function wilsonLower(successes: number, total: number, z: number = 1.96): number {
  if (total === 0) return 0;
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = p + z * z / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  return (center - spread) / denominator;
}

interface ReliabilityScore {
  score: number;           // Wilson lower bound (conservative)
  raw_rate: number;        // Simple successes/total
  confidence: 'low' | 'medium' | 'high';
  sample_size: number;
  successes: number;
  failures: number;
}
```

Confidence thresholds:
- `low`: n < 10
- `medium`: n >= 10, n < 50
- `high`: n >= 50

### Recency Weighting

```typescript
function recencyWeight(daysAgo: number, lambda: number = 0.05): number {
  return Math.exp(-lambda * daysAgo);
}
```

### Quality-Adjusted Speed

Speed only counts for passed tasks within comparable difficulty and domain.

```typescript
interface SpeedScore {
  rating: number;              // 1-5
  avg_duration_ms: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  context: string;             // "within frontend.react, difficulty 0.3-0.7"
  comparable_sample: number;
}
```

### Quality-Adjusted Cost

Efficiency = successful quality output / resource input. Not "fewer tool calls."

```typescript
interface CostScore {
  rating: number;              // 1-5
  avg_tool_calls_per_passed_task: number;
  quality_adjusted_efficiency: number;
  context: string;
}
```

### No "Overall Score" as Primary Metric

An agent can be:
- Strong in frontend.react
- Mediocre in backend.database
- Dangerous in production deploys

A single number hides this. AgentRank's primary output is **domain capability profiles with confidence**, not a score.

The profile view is:
- "Strong in X (high confidence, n=87)"
- "Uncertain in Y (low confidence, n=4)"
- "Avoid for Z (medium confidence, n=23, 3 incidents)"

An `overall_score` exists as secondary summary only, always shown alongside domain breakdown and confidence.

---

## Agent Profile

```typescript
interface AgentProfile {
  // Identity (bound to key material)
  agent_id: string;
  public_key?: string;           // From agentproofs keypair
  model_version?: string;

  // Execution metrics (Layer 1)
  execution: {
    total_tool_calls: number;
    tool_success_rate: number;
    median_duration_ms: number;
    retry_rate: number;
    recovery_rate: number;
    evaluation_coverage: number;  // % of work that was evaluated
  };

  // Outcome metrics (Layer 2)
  outcomes: {
    total_tasks: number;
    passed: number;
    failed: number;
    partial: number;
    abandoned: number;
    unknown: number;
    pass_rate: ReliabilityScore;
    human_approval_rate?: number;
    regression_rate?: number;
    incident_rate?: number;
    missing_evidence_count: number; // Tasks with no build/test/lint
  };

  // Domain capabilities (Layer 3)
  domains: Array<{
    domain: string;
    score: ReliabilityScore;
    total_tasks: number;
    avg_difficulty: number;
    trend: 'improving' | 'stable' | 'degrading';
  }>;

  // Speed (quality-adjusted)
  speed: SpeedScore;

  // Cost (quality-adjusted)
  cost: CostScore;

  // Overall (secondary, never primary)
  overall_score?: number;         // Only shown with domain breakdown
  overall_confidence: 'low' | 'medium' | 'high';

  // Trend
  trend: {
    direction: 'improving' | 'stable' | 'degrading';
    delta_percent: number;
    period_days: number;
    per_domain: Record<string, 'improving' | 'stable' | 'degrading'>;
  };

  // Streaks
  current_streak: number;
  longest_streak: number;

  // Failure intelligence
  failure_patterns: Array<{
    category: FailureCategory;
    count: number;
    last_seen: string;
    trend: 'increasing' | 'stable' | 'decreasing';
  }>;

  // Meta
  confidence: {
    overall: 'low' | 'medium' | 'high';
    domains: Record<string, 'low' | 'medium' | 'high'>;
    based_on_tasks: number;
    based_on_proofs: number;
  };
  scoring_model_version: string;
  domain_classifier_version: string;
  evaluator_versions: string[];
  first_seen: string;
  last_seen: string;
  active_days: number;
}
```

### Failure Taxonomy

```typescript
type FailureCategory =
  | 'syntax_error'
  | 'test_regression'
  | 'build_breakage'
  | 'wrong_file_edit'
  | 'incomplete_change'
  | 'policy_violation'
  | 'hallucinated_path'
  | 'flaky_fix'
  | 'deployment_failure'
  | 'rollback_triggered'
  | 'human_rejected'
  | 'security_issue'
  | 'performance_degradation'
  | 'data_corruption'
  | 'timeout'
  | 'silent_abandonment'
  | 'unknown';
```

---

## Cohort-Based Comparison

Agents are only comparable within fair cohorts.

```typescript
interface CohortFilter {
  domain?: string;
  min_tasks?: number;
  difficulty_range?: [number, number];
  tools_available?: string[];
  environment?: string;
  period_days?: number;
}

interface CohortComparison {
  cohort: CohortFilter;
  agents: Array<{
    agent_id: string;
    score: ReliabilityScore;
    rank_in_cohort: number;
    tasks_in_cohort: number;
  }>;
  total_agents: number;
  cohort_avg_score: number;
}
```

No global leaderboard as default. Instead:
- "Top React agents in repos with test suite"
- "Top infra agents with kubectl access"
- "Top auth agents with human approval workflow"

---

## Routing Recommendation

The primary feature. Not "who is best" but "who should do this next."

```typescript
interface RoutingRecommendation {
  task_description: string;
  detected_domain: string;
  recommended_agents: Array<{
    agent_id: string;
    suitability_score: number;
    confidence: 'low' | 'medium' | 'high';
    reasons: string[];
    risk_factors: string[];
    recent_examples: string[];   // Redacted if privacy mode
  }>;
  minimum_requirements: {
    min_reliability: number;
    required_domains: string[];
    required_tools: string[];
  };
  caveat: string;                // Always: "This is a probabilistic suggestion, not a guarantee."
}
```

---

## Anti-Gaming Controls

### Implemented controls

| Attack | Defense |
|--------|---------|
| Cherry-pick easy tasks | Difficulty normalization — easy tasks give less credit |
| Split tasks to inflate count | Task splitting heuristics — suspiciously short tasks flagged |
| Abandon hard tasks silently | Silent abandonment detection — ACTIVE tasks without activity for >30min marked ABANDONED |
| Skip evaluation | Missing evidence penalty — no build/test/lint is not neutral, it lowers confidence |
| New identity to reset reputation | Identity bound to agentproofs Ed25519 key — new key = zero reputation |
| Reopen and re-close tasks | Reopened task penalty — ticket_reopened counts as partial failure |
| Manipulate tasks.jsonl | Evaluator signature — tampering breaks signature verification |
| Optimize for metric instead of quality | No single "overall score" as target — domain profiles resist Goodhart's Law |

### Coverage metrics

```typescript
interface CoverageMetrics {
  total_proofs: number;          // Total tool calls
  evaluated_proofs: number;      // Linked to a task evaluation
  coverage_rate: number;         // % of work that was evaluated
  unevaluated_sessions: number;  // Sessions with no task evaluations
  missing_evidence_tasks: number;// Tasks without build/test/lint evidence
}
```

Low coverage = low confidence. An agent can't inflate their score by only evaluating their best work.

---

## Privacy and Redaction

AgentRank handles potentially sensitive data. Explicit privacy controls required.

### What may contain PII/sensitive data

| Field | Risk | Mitigation |
|-------|------|-----------|
| `goal` | Task descriptions may contain client names, endpoints, tickets | `goal_hash` stores SHA-256 only. `goal` is opt-in and redactable. |
| `recent_examples` in routing | May reference specific repos/clients | Redacted in public/export mode |
| `failure_patterns` | May reference specific security bugs | Categorized by taxonomy, not raw text |
| `evidence.value` | Build output may contain paths/secrets | Only boolean/number values, never raw output |

### Redaction modes

```typescript
type PrivacyMode = 'full' | 'redacted' | 'hashes_only';

// full: all fields visible (local use only)
// redacted: goal replaced with goal_hash, examples removed
// hashes_only: only hashes and scores, no text at all
```

Export and sharing always default to `redacted` mode.

---

## Snapshot Signing

### Who signs what

| Artifact | Signed by | Why |
|----------|-----------|-----|
| Proof entries | Agent key (agentproofs) | Agent attests: "I performed this action" |
| Task evaluations | Evaluator key (agentrank) | Evaluator attests: "Based on these rules, this is the outcome" |
| Score snapshots | Evaluator key (agentrank) | Evaluator attests: "Based on these evaluations, these are the scores" |
| Export bundles | Owner key (optional) | Owner attests: "I authorize sharing this data" |

**The agent does NOT sign its own reputation.** The evaluator does. This is semantically correct: "the evaluator confirms that this score was computed from this evidence using these rules."

### Key management

```
~/.agentrank/
├── keys/
│   ├── evaluator.key       # Ed25519 private key (auto-generated)
│   └── evaluator.pub       # Ed25519 public key (share for verification)
```

Separate from agentproofs keys. Different trust domain.

---

## Storage Architecture

### JSONL as canonical append-only record
- `~/.agentrank/tasks.jsonl` — task evaluations (append-only, signed)
- Portable, human-readable, auditable

### SQLite as rebuildable index
- `~/.agentrank/index.db` — query index (rebuildable from tasks.jsonl)
- Enables fast queries, aggregations, trend windows
- Can be deleted and rebuilt: `npx agentrank rebuild-index`

### Computed artifacts
- Agent profiles — computed on demand, cached
- Routing recommendations — computed on demand, not stored
- Snapshots — exported as signed JSON files

```
~/.agentrank/
├── tasks.jsonl             # Canonical task evaluations (signed)
├── index.db                # Rebuildable query index (SQLite)
├── keys/
│   ├── evaluator.key       # Ed25519 private
│   └── evaluator.pub       # Ed25519 public
├── snapshots/              # Signed score snapshots
└── exports/                # Audit exports
```

---

## MCP Tools

### rank_agent
Full profile with confidence intervals and domain breakdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent_id | string | no | Default: current agent |
| period_days | number | no | Default: 30 |
| domain_filter | string | no | Specific domain |
| include_evidence | boolean | no | Include evidence summary |
| privacy_mode | string | no | "full", "redacted", "hashes_only" |

### rank_route
Best agent for a specific task. **The primary feature.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_description | string | yes | What needs to be done |
| domain_hint | string | no | e.g., "frontend.react" |
| required_tools | string[] | no | Tools agent must have |
| min_reliability | number | no | Default: 0.6 |
| min_confidence | string | no | Default: "medium" |
| risk_level | string | no | "low", "medium", "high" |

### rank_explain
Why does this agent have this score? Full transparency.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent_id | string | no | Default: current |
| domain | string | no | Explain domain score specifically |

### rank_failures
Failure pattern analysis with taxonomy.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent_id | string | no | Default: current |
| period_days | number | no | Default: 30 |
| domain | string | no | Filter by domain |

### rank_compare
Compare agents within fair cohort.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent_a | string | yes | First agent |
| agent_b | string | yes | Second agent |
| cohort | CohortFilter | no | Fair comparison constraints |

### rank_cohort
Cohort leaderboard with fair constraints.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| domain | string | no | Domain filter |
| min_tasks | number | no | Minimum tasks |
| sort_by | string | no | "reliability", "speed", "cost" |
| limit | number | no | Max results |

### rank_task
Log or query task evaluations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | yes | "log", "query", "revise" |
| task_id | string | depends | For query/revise |
| goal | string | depends | For log |
| outcome | string | depends | For log |
| evidence | OutcomeEvidence[] | no | Outcome evidence |
| proof_ids | string[] | no | Related agentproofs entries |
| revision_reason | string | no | For revise: why outcome changed |

### rank_snapshot
Create reproducible, signed score snapshot.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent_id | string | no | Default: current |
| sign | boolean | no | Sign with evaluator key |
| privacy_mode | string | no | Default: "redacted" |

---

## MCP Resources

| URI | Description |
|-----|-------------|
| `rank://overview` | All agents with confidence levels |
| `rank://agent/{id}` | Full profile for agent |
| `rank://domains` | Domain capability map |
| `rank://trends` | Performance trends over time |
| `rank://routing/{domain}` | Best agents for domain |
| `rank://failures/{id}` | Failure patterns for agent |
| `rank://cohort/{domain}` | Cohort comparison |
| `rank://snapshots/latest` | Latest scored snapshots |
| `rank://confidence` | Confidence overview |
| `rank://tasks/recent` | Recent task evaluations |
| `rank://coverage` | Evaluation coverage metrics |

---

## CLI Commands

```bash
# MCP server
npx agentrank                           # Start MCP server

# Profiles
npx agentrank profile                   # Current agent
npx agentrank profile <agent-id>        # Specific agent
npx agentrank explain                   # Why this score?

# Routing
npx agentrank route "fix auth bug"      # Who should do this?
npx agentrank route --domain backend.python

# Comparison
npx agentrank compare agent-a agent-b   # Fair cohort comparison
npx agentrank cohort --domain frontend.react

# Failure intelligence
npx agentrank failures                  # My failure patterns

# Tasks
npx agentrank task log --goal "..." --outcome passed
npx agentrank tasks --recent 10

# Snapshots
npx agentrank snapshot --sign           # Signed snapshot

# Maintenance
npx agentrank rebuild-index             # Rebuild SQLite from tasks.jsonl
npx agentrank coverage                  # Evaluation coverage report
```

---

## Auto-Evaluation Hook

PostToolUse hook that detects task boundaries and evaluates outcomes.

### Task boundary detection
- New user message after tool calls = likely new task
- Explicit completion signals ("done", "klaar", commit, push)
- Session end = task end (TIMEOUT state)
- Project/directory change = new task context

**Limitations acknowledged:**
- One prompt can contain multiple subtasks
- One task can span multiple sessions
- A commit says nothing about quality
- Heuristics are used, never treated as canonical truth

### Auto-evaluation signals
- `npm run build` / `cargo build` → build_pass/fail
- `npm test` / `pytest` → test_pass/fail
- `npm run lint` / `eslint` → lint_pass/fail
- `tsc --noEmit` → typecheck_pass/fail
- `git commit` → completion signal
- Tool failure → failure signal
- Multiple retries → difficulty signal
- No signals at all → missing_evidence (lowers confidence)

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTRANK_PROOFS_PATH` | `~/.agentproofs/chain.jsonl` | Proof chain |
| `AGENTRANK_TASKS_PATH` | `~/.agentrank/tasks.jsonl` | Task evaluations |
| `AGENTRANK_INDEX_PATH` | `~/.agentrank/index.db` | Query index |
| `AGENTRANK_AGENT_ID` | `"claude-code"` | Current agent |
| `AGENTRANK_DECAY_LAMBDA` | `0.05` | Recency decay |
| `AGENTRANK_MIN_TASKS` | `5` | Min tasks for domain score |
| `AGENTRANK_MIN_CONFIDENCE` | `10` | Min tasks for confident score |
| `AGENTRANK_PERIOD_DAYS` | `30` | Default period |
| `AGENTRANK_SCORING_VERSION` | `"1.0"` | Scoring model version |
| `AGENTRANK_DOMAIN_VERSION` | `"1.0"` | Domain classifier version |
| `AGENTRANK_PRIVACY_MODE` | `"full"` | Default privacy mode |
| `AGENTRANK_ABANDONMENT_TIMEOUT_MIN` | `30` | Minutes before ABANDONED |

---

## File Structure

```
agentrank/
├── bin/
│   └── cli.mjs
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── config.ts
│   ├── types.ts
│   ├── chain-reader.ts
│   ├── tasks/
│   │   ├── store.ts              # JSONL storage (signed, append-only)
│   │   ├── state-machine.ts      # Task lifecycle states
│   │   ├── boundary.ts           # Task boundary detection
│   │   └── evaluators/
│   │       ├── registry.ts       # Plugin evaluator registry
│   │       ├── code.ts           # CodeEvaluator (build/test/lint)
│   │       ├── deploy.ts         # DeployEvaluator
│   │       ├── human.ts          # HumanEvaluator
│   │       └── completion.ts     # CompletionEvaluator
│   ├── scoring/
│   │   ├── reliability.ts        # Bayesian (Wilson lower bound)
│   │   ├── difficulty.ts         # Task difficulty from context
│   │   ├── speed.ts              # Quality-adjusted speed
│   │   ├── cost.ts               # Quality-adjusted cost
│   │   └── trend.ts              # Rolling window trends
│   ├── domains/
│   │   ├── taxonomy.ts           # Domain hierarchy
│   │   ├── classifier.ts         # Weighted multi-signal classifier
│   │   └── expertise.ts          # Domain expertise computation
│   ├── intelligence/
│   │   ├── routing.ts            # Routing recommendations
│   │   ├── failures.ts           # Failure pattern analysis + taxonomy
│   │   ├── cohorts.ts            # Cohort-based comparison
│   │   ├── explain.ts            # Explainable scoring
│   │   └── coverage.ts           # Evaluation coverage metrics
│   ├── crypto/
│   │   ├── keys.ts               # Evaluator keypair management
│   │   └── signing.ts            # Task/snapshot signing
│   ├── privacy/
│   │   └── redaction.ts          # PII redaction for export/sharing
│   ├── storage/
│   │   └── index-db.ts           # SQLite rebuildable index
│   ├── profile.ts                # AgentProfile computation
│   ├── snapshot.ts               # Signed score snapshots
│   ├── contributors.ts           # Multi-agent attribution
│   └── resources.ts              # MCP resources
├── templates/
│   └── hooks/
│       └── agentrank-evaluator.js
├── tests/
│   ├── tasks/
│   │   ├── store.test.ts
│   │   ├── state-machine.test.ts
│   │   ├── boundary.test.ts
│   │   └── evaluators/
│   │       ├── code.test.ts
│   │       ├── deploy.test.ts
│   │       └── completion.test.ts
│   ├── scoring/
│   │   ├── reliability.test.ts
│   │   ├── difficulty.test.ts
│   │   ├── speed.test.ts
│   │   ├── cost.test.ts
│   │   └── trend.test.ts
│   ├── domains/
│   │   ├── taxonomy.test.ts
│   │   ├── classifier.test.ts
│   │   └── expertise.test.ts
│   ├── intelligence/
│   │   ├── routing.test.ts
│   │   ├── failures.test.ts
│   │   ├── cohorts.test.ts
│   │   ├── explain.test.ts
│   │   └── coverage.test.ts
│   ├── crypto/
│   │   └── signing.test.ts
│   ├── privacy/
│   │   └── redaction.test.ts
│   ├── contributors.test.ts
│   ├── profile.test.ts
│   ├── chain-reader.test.ts
│   └── integration/
│       └── server.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
└── LICENSE
```

---

## Test Plan

| Area | Tests |
|------|-------|
| Chain reader | 5 |
| Task store (signed JSONL) | 6 |
| Task state machine | 8 |
| Task boundary detection | 6 |
| Code evaluator | 8 |
| Deploy evaluator | 4 |
| Completion evaluator | 4 |
| Reliability (Wilson) | 8 |
| Difficulty scoring | 6 |
| Speed (quality-adjusted) | 4 |
| Cost (quality-adjusted) | 4 |
| Trend analysis | 5 |
| Domain taxonomy | 4 |
| Domain classifier (weighted) | 8 |
| Domain expertise | 5 |
| Routing recommendations | 6 |
| Failure patterns + taxonomy | 6 |
| Cohort comparison | 5 |
| Explainable scoring | 3 |
| Coverage metrics | 4 |
| Evaluator signing | 4 |
| Privacy/redaction | 5 |
| Multi-agent contributors | 5 |
| Profile computation | 4 |
| Snapshot (signed) | 3 |
| Integration (MCP server) | 4 |
| **Total** | **142** |

---

## The Complete Stack

```
agentproofs       →  agentrank         →  neurohive
(what happened)      (evaluation +        (multi-agent routing
                      scoring +            with reputation)
                      routing)

chain.jsonl    →     tasks.jsonl     →    shared memory +
(signed proofs)      (signed evals +      routing decisions
                      rebuildable index)
```

Each package is independently useful. Together they form an agent intelligence stack where every claim is backed by evidence, every score includes confidence, and every recommendation is explainable.
