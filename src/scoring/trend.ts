import type { TrendDirection } from '../types.ts';

/**
 * Compute trend direction from a time series of scores.
 * Uses simple linear regression over recent windows.
 */
export function computeTrend(
  dataPoints: ReadonlyArray<{ timestamp: string; value: number }>,
  windowDays = 30,
): { direction: TrendDirection; delta_percent: number } {
  if (dataPoints.length < 3) {
    return { direction: 'stable', delta_percent: 0 };
  }

  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const recent = dataPoints.filter(
    (d) => now - new Date(d.timestamp).getTime() < windowMs,
  );

  if (recent.length < 3) {
    return { direction: 'stable', delta_percent: 0 };
  }

  // Split into first half and second half
  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);

  const firstAvg = average(firstHalf.map((d) => d.value));
  const secondAvg = average(secondHalf.map((d) => d.value));

  if (firstAvg === 0) {
    return { direction: 'stable', delta_percent: 0 };
  }

  const delta = ((secondAvg - firstAvg) / firstAvg) * 100;

  let direction: TrendDirection;
  if (delta > 5) direction = 'improving';
  else if (delta < -5) direction = 'degrading';
  else direction = 'stable';

  return {
    direction,
    delta_percent: Math.round(delta * 10) / 10,
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Recency weight: exponential decay.
 */
export function recencyWeight(daysAgo: number, lambda = 0.05): number {
  return Math.exp(-lambda * daysAgo);
}

/**
 * Compute days ago from timestamp.
 */
export function daysAgo(timestamp: string): number {
  const ms = Date.now() - new Date(timestamp).getTime();
  return ms / (24 * 60 * 60 * 1000);
}
