import test from "node:test";
import assert from "node:assert/strict";

import type { RunSummary } from "../../engine/game";
import { createRunStats } from "../../engine/game/run_stats";
import type { GameMode } from "../../engine/game/rules";
import { buildRunSummaryViewModel, formatRunDuration } from "../../app/runSummary";

const makeSummary = (mode: GameMode, overrides: Partial<RunSummary> = {}): RunSummary => {
  const stats = createRunStats();
  stats.locksPlaced = 20;
  stats.maxCombo = 3;
  stats.holdUses = 2;
  stats.hardDropCellsTotal = 80;
  stats.softDropCellsTotal = 12;
  return {
    width: 10,
    height: 20,
    gameMode: mode,
    score: 1234,
    level: 2,
    linesClearedTotal: 10,
    remainingMs: null,
    gameOver: true,
    stats,
    metrics: {
      speed: {
        durationMs: 40_000,
        piecesPerSecond: 0.5,
      },
      attack: {
        attackTotal: 0,
        attacksPerMinute: 0,
        attackPerPiece: 0,
      },
      backToBack: {
        chain: 0,
        maxChain: 0,
        multiplier: 1,
      },
    },
    ...overrides,
  };
};

test("formatRunDuration renders minute, second, and hundredths", () => {
  assert.equal(formatRunDuration(65_430), "1:05.43");
  assert.equal(formatRunDuration(-10), "0:00.00");
});

test("Sprint summary emphasizes completion time and board label", () => {
  const view = buildRunSummaryViewModel(makeSummary("sprint"), 65_430, "rectangular");

  assert.equal(view.headline, "Sprint Complete");
  assert.equal(view.subhead, "Sprint / Regular");
  assert.equal(view.primaryLabel, "Time");
  assert.equal(view.primaryValue, "1:05.43");
  assert.equal(view.stats.some((stat) => stat.label === "Score"), false);
});

test("Timed summary emphasizes score and includes level", () => {
  const view = buildRunSummaryViewModel(makeSummary("timed"), 120_000, "ring");

  assert.equal(view.headline, "Time Up");
  assert.equal(view.subhead, "Timed / Spinny");
  assert.equal(view.primaryLabel, "Score");
  assert.equal(view.primaryValue, "1234");
  assert.equal(view.stats.find((stat) => stat.label === "Level")?.value, "2");
  assert.equal(view.stats.find((stat) => stat.label === "PPS")?.value, "0.50");
});
