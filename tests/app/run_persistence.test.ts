import test from "node:test";
import assert from "node:assert/strict";

import { buildCoreRunInsert, buildRunInsert, isMissingRunColumnError } from "../../app/persistence/runs";
import type { RunSummary } from "../../engine/game";
import { createRunMetrics } from "../../engine/game/metrics";
import { createRunStats } from "../../engine/game/run_stats";

const buildSummary = (): RunSummary => {
  const stats = createRunStats();
  stats.locksPlaced = 7;
  stats.holdUses = 1;
  stats.hardDropCellsTotal = 20;
  stats.softDropCellsTotal = 3;
  stats.maxCombo = 2;
  stats.lineClearsByCount.zero = 1;
  stats.lineClearsByCount.single = 2;
  stats.lineClearsByCount.double = 3;
  stats.lineClearsByCount.triple = 4;
  stats.lineClearsByCount.quadPlus = 5;
  stats.tSpinMiniCount = 1;
  stats.tSpinCount = 3;
  stats.tSpinSingles = 1;
  stats.tSpinDoubles = 1;
  stats.tSpinTriples = 1;
  stats.allSpinCount = 2;

  return {
    gameMode: "timed",
    width: 10,
    height: 20,
    score: 123,
    level: 2,
    linesClearedTotal: 4,
    remainingMs: null,
    gameOver: true,
    stats,
    metrics: createRunMetrics(stats, 0),
  };
};

test("isMissingRunColumnError identifies Supabase missing-column errors", () => {
  assert.equal(isMissingRunColumnError({ code: "42703", message: "column runs.pieces does not exist" }), true);
  assert.equal(isMissingRunColumnError({ code: "PGRST204", message: "Could not find the pieces column" }), true);
});

test("isMissingRunColumnError ignores unrelated persistence errors", () => {
  assert.equal(isMissingRunColumnError({ code: "42501", message: "new row violates row-level security policy" }), false);
  assert.equal(isMissingRunColumnError(null), false);
});

test("run insert payloads include the required finished_at timestamp", () => {
  const finishedAt = new Date("2026-05-10T12:34:56.000Z");
  const summary = buildSummary();

  assert.equal(buildRunInsert("user-1", summary, 1000, "rectangular", finishedAt).finished_at, finishedAt.toISOString());
  assert.equal(
    buildCoreRunInsert("user-1", summary, 1000, "rectangular", finishedAt).finished_at,
    finishedAt.toISOString(),
  );
});
