import { describe, it, expect } from 'vitest';
import { wilsonLower, getConfidence, computeReliability, computeWeightedReliability } from '../../src/scoring/reliability.ts';

describe('Wilson Lower Bound', () => {
  it('returns 0 for empty sample', () => {
    expect(wilsonLower(0, 0)).toBe(0);
  });

  it('gives conservative estimate for small samples', () => {
    // 4/4 should NOT be 100% — Wilson accounts for uncertainty
    const score = wilsonLower(4, 4);
    expect(score).toBeLessThan(0.8);
    expect(score).toBeGreaterThan(0.3);
  });

  it('converges to raw rate for large samples', () => {
    const score = wilsonLower(800, 1000);
    expect(score).toBeCloseTo(0.8, 1);
  });

  it('is monotonically increasing with successes', () => {
    const s1 = wilsonLower(5, 10);
    const s2 = wilsonLower(7, 10);
    const s3 = wilsonLower(9, 10);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  it('penalizes small samples more than large ones', () => {
    // Same 80% rate, but different confidence
    const small = wilsonLower(4, 5);
    const large = wilsonLower(80, 100);
    expect(large).toBeGreaterThan(small);
  });
});

describe('Confidence', () => {
  it('returns low for < 10', () => {
    expect(getConfidence(0)).toBe('low');
    expect(getConfidence(9)).toBe('low');
  });

  it('returns medium for 10-49', () => {
    expect(getConfidence(10)).toBe('medium');
    expect(getConfidence(49)).toBe('medium');
  });

  it('returns high for >= 50', () => {
    expect(getConfidence(50)).toBe('high');
    expect(getConfidence(1000)).toBe('high');
  });
});

describe('Reliability Score', () => {
  it('computes full reliability', () => {
    const r = computeReliability(7, 10);
    expect(r.score).toBeGreaterThan(0);
    expect(r.raw_rate).toBeCloseTo(0.7);
    expect(r.sample_size).toBe(10);
    expect(r.successes).toBe(7);
    expect(r.failures).toBe(3);
    expect(r.confidence).toBe('medium');
  });

  it('handles zero total', () => {
    const r = computeReliability(0, 0);
    expect(r.score).toBe(0);
    expect(r.raw_rate).toBe(0);
    expect(r.confidence).toBe('low');
  });
});

describe('Weighted Reliability', () => {
  it('weights recent tasks higher', () => {
    const tasks = [
      { success: false, daysAgo: 30 }, // old failure
      { success: true, daysAgo: 1 },   // recent success
      { success: true, daysAgo: 2 },   // recent success
    ];
    const r = computeWeightedReliability(tasks);
    // Recent successes should dominate
    expect(r.raw_rate).toBeGreaterThan(0.5);
  });

  it('handles empty tasks', () => {
    const r = computeWeightedReliability([]);
    expect(r.score).toBe(0);
    expect(r.sample_size).toBe(0);
  });
});
