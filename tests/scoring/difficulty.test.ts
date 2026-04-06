import { describe, it, expect } from 'vitest';
import { computeDifficulty, estimateBlastRadius } from '../../src/scoring/difficulty.ts';

describe('Difficulty', () => {
  it('returns low score for trivial task', () => {
    const d = computeDifficulty({
      files_touched: 1,
      lines_changed: 10,
      retries_needed: 0,
      tools_used: 2,
      blast_radius: 'low',
      production_proximity: false,
      cross_module: false,
    });
    expect(d.score).toBeLessThan(0.3);
  });

  it('returns high score for complex task', () => {
    const d = computeDifficulty({
      files_touched: 20,
      lines_changed: 500,
      retries_needed: 5,
      tools_used: 10,
      blast_radius: 'high',
      production_proximity: true,
      cross_module: true,
    });
    expect(d.score).toBeGreaterThan(0.7);
  });

  it('production proximity increases difficulty', () => {
    const base = computeDifficulty({
      files_touched: 5, lines_changed: 50, retries_needed: 0,
      tools_used: 3, blast_radius: 'low', production_proximity: false, cross_module: false,
    });
    const prod = computeDifficulty({
      files_touched: 5, lines_changed: 50, retries_needed: 0,
      tools_used: 3, blast_radius: 'low', production_proximity: true, cross_module: false,
    });
    expect(prod.score).toBeGreaterThan(base.score);
  });

  it('preserves factors in output', () => {
    const d = computeDifficulty({
      files_touched: 3, lines_changed: 100, retries_needed: 1,
      tools_used: 5, blast_radius: 'medium', production_proximity: false, cross_module: true,
    });
    expect(d.factors.files_touched).toBe(3);
    expect(d.factors.blast_radius).toBe('medium');
  });
});

describe('Blast Radius', () => {
  it('detects high for deploy files', () => {
    expect(estimateBlastRadius(['deploy.sh', 'src/index.ts'])).toBe('high');
  });

  it('detects medium for config files', () => {
    expect(estimateBlastRadius(['package.json', 'src/utils.ts'])).toBe('medium');
  });

  it('detects low for regular files', () => {
    expect(estimateBlastRadius(['src/utils.ts', 'src/helper.ts'])).toBe('low');
  });
});
