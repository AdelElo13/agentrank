import { describe, it, expect } from 'vitest';
import { computeTrend, recencyWeight, daysAgo } from '../../src/scoring/trend.ts';

describe('Trend', () => {
  it('returns stable for few data points', () => {
    const result = computeTrend([
      { timestamp: new Date().toISOString(), value: 1 },
    ]);
    expect(result.direction).toBe('stable');
  });

  it('detects improving trend', () => {
    const now = Date.now();
    const points = [];
    // First half: low scores
    for (let i = 29; i >= 15; i--) {
      points.push({ timestamp: new Date(now - i * 86400000).toISOString(), value: 0.3 });
    }
    // Second half: high scores
    for (let i = 14; i >= 0; i--) {
      points.push({ timestamp: new Date(now - i * 86400000).toISOString(), value: 0.8 });
    }
    const result = computeTrend(points, 30);
    expect(result.direction).toBe('improving');
    expect(result.delta_percent).toBeGreaterThan(0);
  });

  it('detects degrading trend', () => {
    const now = Date.now();
    const points = [];
    for (let i = 29; i >= 15; i--) {
      points.push({ timestamp: new Date(now - i * 86400000).toISOString(), value: 0.9 });
    }
    for (let i = 14; i >= 0; i--) {
      points.push({ timestamp: new Date(now - i * 86400000).toISOString(), value: 0.3 });
    }
    const result = computeTrend(points, 30);
    expect(result.direction).toBe('degrading');
  });
});

describe('Recency Weight', () => {
  it('returns 1 for today', () => {
    expect(recencyWeight(0)).toBeCloseTo(1);
  });

  it('decays exponentially', () => {
    const w14 = recencyWeight(14, 0.05);
    expect(w14).toBeCloseTo(0.497, 2);
  });

  it('approaches 0 for old data', () => {
    expect(recencyWeight(100, 0.05)).toBeLessThan(0.01);
  });
});

describe('Days Ago', () => {
  it('returns ~0 for now', () => {
    const d = daysAgo(new Date().toISOString());
    expect(d).toBeLessThan(0.01);
  });

  it('returns ~1 for yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const d = daysAgo(yesterday);
    expect(d).toBeCloseTo(1, 0);
  });
});
