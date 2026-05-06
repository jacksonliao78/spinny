import type { RunMetrics, RunStats } from "./types";

const safeRate = (numerator: number, denominator: number): number => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
};

export const createRunMetrics = (stats: RunStats, durationMs: number): RunMetrics => {
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const durationSeconds = safeDurationMs / 1000;
  const durationMinutes = safeDurationMs / 60_000;
  const attackTotal = 0;

  return {
    speed: {
      durationMs: safeDurationMs,
      piecesPerSecond: safeRate(stats.locksPlaced, durationSeconds),
    },
    attack: {
      attackTotal,
      attacksPerMinute: safeRate(attackTotal, durationMinutes),
      attackPerPiece: safeRate(attackTotal, stats.locksPlaced),
    },
    backToBack: {
      chain: stats.b2bChain,
      maxChain: stats.b2bMaxChain,
      multiplier: 1,
    },
  };
};

