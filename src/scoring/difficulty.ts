import type { TaskDifficulty, BlastRadius } from '../types.ts';

/**
 * Compute task difficulty from context factors.
 * Returns 0-1 score where 0 = trivial, 1 = extremely hard.
 */
export function computeDifficulty(factors: {
  files_touched: number;
  lines_changed: number;
  retries_needed: number;
  tools_used: number;
  blast_radius: BlastRadius;
  production_proximity: boolean;
  cross_module: boolean;
}): TaskDifficulty {
  // Normalize each factor to 0-1
  const fileScore = Math.min(factors.files_touched / 20, 1);
  const lineScore = Math.min(factors.lines_changed / 500, 1);
  const retryScore = Math.min(factors.retries_needed / 5, 1);
  const toolScore = Math.min(factors.tools_used / 10, 1);
  const blastScore = factors.blast_radius === 'high' ? 1 : factors.blast_radius === 'medium' ? 0.5 : 0.2;
  const prodScore = factors.production_proximity ? 0.8 : 0;
  const crossModScore = factors.cross_module ? 0.7 : 0;

  // Weighted combination
  const score = (
    fileScore * 0.15 +
    lineScore * 0.15 +
    retryScore * 0.15 +
    toolScore * 0.10 +
    blastScore * 0.15 +
    prodScore * 0.15 +
    crossModScore * 0.15
  );

  return {
    score: Math.round(score * 100) / 100,
    factors,
  };
}

/**
 * Estimate blast radius from file paths.
 */
export function estimateBlastRadius(files: readonly string[]): BlastRadius {
  const hasProdFiles = files.some((f) =>
    f.includes('deploy') || f.includes('production') ||
    f.includes('Dockerfile') || f.includes('.env') ||
    f.includes('ci') || f.includes('cd'),
  );
  const hasConfigFiles = files.some((f) =>
    f.includes('config') || f.includes('package.json') ||
    f.includes('tsconfig') || f.includes('Cargo.toml'),
  );

  if (hasProdFiles) return 'high';
  if (hasConfigFiles) return 'medium';
  return 'low';
}
