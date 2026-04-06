// ── Task Outcomes ──

export const TASK_OUTCOMES = ['passed', 'failed', 'partial', 'abandoned', 'unknown'] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

// ── Task States ──

export const TASK_STATES = [
  'created', 'active', 'evaluating', 'pending_evidence',
  'evaluated', 'revised', 'abandoned', 'timeout',
] as const;
export type TaskState = (typeof TASK_STATES)[number];

// ── Evidence Types ──

export const EVIDENCE_TYPES = [
  'build_pass', 'build_fail',
  'test_pass', 'test_fail',
  'lint_pass', 'lint_fail',
  'typecheck_pass', 'typecheck_fail',
  'human_approval', 'human_rejection',
  'deployment_healthy', 'deployment_failed', 'rollback_triggered',
  'incident_created', 'no_regression_24h', 'regression_detected',
  'task_abandoned', 'ticket_closed', 'ticket_reopened',
  'custom',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

// ── Contributor Roles ──

export const CONTRIBUTOR_ROLES = [
  'planner', 'executor', 'reviewer', 'tester', 'fixer', 'deployer', 'sole',
] as const;
export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number];

// ── Failure Categories ──

export const FAILURE_CATEGORIES = [
  'syntax_error', 'test_regression', 'build_breakage', 'wrong_file_edit',
  'incomplete_change', 'policy_violation', 'hallucinated_path', 'flaky_fix',
  'deployment_failure', 'rollback_triggered', 'human_rejected',
  'security_issue', 'performance_degradation', 'data_corruption',
  'timeout', 'silent_abandonment', 'unknown',
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

// ── Privacy ──

export type PrivacyMode = 'full' | 'redacted' | 'hashes_only';

// ── Confidence ──

export type Confidence = 'low' | 'medium' | 'high';

// ── Blast Radius ──

export type BlastRadius = 'low' | 'medium' | 'high';

// ── Trend Direction ──

export type TrendDirection = 'improving' | 'stable' | 'degrading';

// ── Outcome Evidence ──

export interface OutcomeEvidence {
  readonly type: EvidenceType;
  readonly value: boolean | number | string;
  readonly weight: number;
  readonly source_proof_id?: string;
  readonly timestamp: string;
  readonly evaluator_version: string;
}

// ── Task Difficulty ──

export interface TaskDifficulty {
  readonly score: number;
  readonly factors: {
    readonly files_touched: number;
    readonly lines_changed: number;
    readonly retries_needed: number;
    readonly tools_used: number;
    readonly blast_radius: BlastRadius;
    readonly production_proximity: boolean;
    readonly cross_module: boolean;
  };
}

// ── Contributor ──

export interface Contributor {
  readonly agent_id: string;
  readonly role: ContributorRole;
  readonly proof_ids: readonly string[];
  readonly contribution_weight: number;
}

// ── Task Run (core evaluation unit) ──

export interface TaskRun {
  readonly task_id: string;
  readonly agent_id: string;
  readonly session_id: string;

  // What
  readonly goal: string;
  readonly goal_hash: string;
  readonly domain: string;

  // When
  readonly started_at: string;
  readonly ended_at?: string;

  // State
  readonly state: TaskState;

  // How
  readonly related_proof_ids: readonly string[];
  readonly tool_calls: number;
  readonly files_touched: number;
  readonly lines_changed: number;
  readonly retries: number;

  // Result
  readonly outcome: TaskOutcome;
  readonly evidence: readonly OutcomeEvidence[];
  readonly reviewer: 'human' | 'automated' | 'hybrid' | 'none';

  // Difficulty
  readonly difficulty: TaskDifficulty;

  // Multi-agent
  readonly contributors: readonly Contributor[];

  // Trust
  readonly evaluator_id: string;
  readonly evaluator_version: string;
  readonly evaluator_signature: string;

  // Privacy
  readonly redacted: boolean;
}

// ── Reliability Score (Bayesian) ──

export interface ReliabilityScore {
  readonly score: number;
  readonly raw_rate: number;
  readonly confidence: Confidence;
  readonly sample_size: number;
  readonly successes: number;
  readonly failures: number;
}

// ── Speed Score ──

export interface SpeedScore {
  readonly rating: number;
  readonly avg_duration_ms: number;
  readonly p50_duration_ms: number;
  readonly p95_duration_ms: number;
  readonly context: string;
  readonly comparable_sample: number;
}

// ── Cost Score ──

export interface CostScore {
  readonly rating: number;
  readonly avg_tool_calls_per_passed_task: number;
  readonly quality_adjusted_efficiency: number;
  readonly context: string;
}

// ── Domain Score ──

export interface DomainScore {
  readonly domain: string;
  readonly score: ReliabilityScore;
  readonly total_tasks: number;
  readonly avg_difficulty: number;
  readonly trend: TrendDirection;
}

// ── Failure Pattern ──

export interface FailurePattern {
  readonly category: FailureCategory;
  readonly count: number;
  readonly last_seen: string;
  readonly trend: 'increasing' | 'stable' | 'decreasing';
}

// ── Agent Profile ──

export interface AgentProfile {
  readonly agent_id: string;
  readonly model_version?: string;

  // Layer 1: Execution
  readonly execution: {
    readonly total_tool_calls: number;
    readonly tool_success_rate: number;
    readonly median_duration_ms: number;
    readonly retry_rate: number;
    readonly recovery_rate: number;
    readonly evaluation_coverage: number;
  };

  // Layer 2: Outcomes
  readonly outcomes: {
    readonly total_tasks: number;
    readonly passed: number;
    readonly failed: number;
    readonly partial: number;
    readonly abandoned: number;
    readonly unknown: number;
    readonly pass_rate: ReliabilityScore;
    readonly incident_rate: number;
    readonly missing_evidence_count: number;
  };

  // Layer 3: Domains
  readonly domains: readonly DomainScore[];

  // Speed + Cost
  readonly speed: SpeedScore;
  readonly cost: CostScore;

  // Overall (secondary)
  readonly overall_score: number;
  readonly overall_confidence: Confidence;

  // Trend
  readonly trend: {
    readonly direction: TrendDirection;
    readonly delta_percent: number;
    readonly period_days: number;
  };

  // Streaks
  readonly current_streak: number;
  readonly longest_streak: number;

  // Failure intelligence
  readonly failure_patterns: readonly FailurePattern[];

  // Meta
  readonly scoring_model_version: string;
  readonly first_seen: string;
  readonly last_seen: string;
  readonly active_days: number;
}

// ── Routing Recommendation ──

export interface RoutingRecommendation {
  readonly task_description: string;
  readonly detected_domain: string;
  readonly recommended_agents: ReadonlyArray<{
    readonly agent_id: string;
    readonly suitability_score: number;
    readonly confidence: Confidence;
    readonly reasons: readonly string[];
    readonly risk_factors: readonly string[];
  }>;
  readonly caveat: string;
}

// ── Cohort Comparison ──

export interface CohortFilter {
  readonly domain?: string;
  readonly min_tasks?: number;
  readonly difficulty_range?: readonly [number, number];
  readonly period_days?: number;
}

export interface CohortComparison {
  readonly cohort: CohortFilter;
  readonly agents: ReadonlyArray<{
    readonly agent_id: string;
    readonly score: ReliabilityScore;
    readonly rank_in_cohort: number;
    readonly tasks_in_cohort: number;
  }>;
  readonly total_agents: number;
  readonly cohort_avg_score: number;
}

// ── Coverage Metrics ──

export interface CoverageMetrics {
  readonly total_tasks: number;
  readonly evaluated_tasks: number;
  readonly coverage_rate: number;
  readonly missing_evidence_tasks: number;
  readonly tasks_by_state: Record<TaskState, number>;
}

// ── Snapshot ──

export interface ScoreSnapshot {
  readonly snapshot_id: string;
  readonly agent_id: string;
  readonly timestamp: string;
  readonly profile: AgentProfile;
  readonly evaluator_id: string;
  readonly evaluator_version: string;
  readonly scoring_model_version: string;
  readonly signature?: string;
  readonly privacy_mode: PrivacyMode;
}

// ── Config ──

export interface AgentRankConfig {
  readonly dataDir: string;
  readonly proofsDir: string;
  readonly agentId: string;
  readonly decayLambda: number;
  readonly minTasks: number;
  readonly minConfidence: number;
  readonly periodDays: number;
  readonly scoringVersion: string;
  readonly domainVersion: string;
  readonly privacyMode: PrivacyMode;
  readonly abandonmentTimeoutMin: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// ── Key Pair (evaluator) ──

export interface EvaluatorKeyPair {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly keyId: string;
}

// ── Proof Entry (read from agentproofs, simplified) ──

export interface ProofEntry {
  readonly id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly agent_id: string;
  readonly session_id: string;
  readonly event_type: string;
  readonly tool_invocation_id?: string;
  readonly action: {
    readonly tool?: string;
    readonly input_hash: string;
    readonly output_hash: string;
    readonly input_summary?: string;
    readonly output_summary?: string;
    readonly duration_ms?: number;
    readonly success: boolean;
    readonly error_message?: string;
  };
  readonly context: {
    readonly working_dir?: string;
    readonly namespace?: string;
    readonly tags?: readonly string[];
    readonly origin: string;
    readonly git_commit?: string;
  };
}
