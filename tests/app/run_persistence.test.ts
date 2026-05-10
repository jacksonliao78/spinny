import test from "node:test";
import assert from "node:assert/strict";

import { buildCoreRunInsert, buildRunInsert, isMissingRunColumnError } from "../../app/persistence/runs";
import type { RunSummary } from "../../engine/game";

const summary: RunSummary = {
  gameMode: "timed",
  width: 10,
  height: 20,
  score: 123,
  level: 2,
  linesClearedTotal: 4,
  gameOver: true,
  stats: {
    locksPlaced: 7,
    holdUses: 1,
    hardDropCellsTotal: 20,
    softDropCellsTotal: 3,
    maxCombo: 2,
    lineClearsByCount: {
      zero: 1,
      single: 2,
      double: 3,
      triple: 4,
      quadPlus: 5,
    },
    tSpinMiniCount: 1,
    tSpinCount: 3,
    tSpinSingles: 1,
    tSpinDoubles: 1,
    tSpinTriples: 1,
    allSpinCount: 2,
    garbageReceivedTotal: 0,
    garbageReceivedEvents: 0,
    garbageAppliedTotal: 0,
  },
  metrics: {
    speed: {
      durationMs: 0,
      piecesPerSecond: 0,
      linesPerMinute: 0,
      scorePerMinute: 0,
    },
    attack: {
      attackSent: 0,
      attackPerMinute: 0,
    },
    backToBack: {
      chain: 0,
      maxChain: 0,
    },
  },
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

  assert.equal(buildRunInsert("user-1", summary, 1000, "rectangular", finishedAt).finished_at, finishedAt.toISOString());
  assert.equal(
    buildCoreRunInsert("user-1", summary, 1000, "rectangular", finishedAt).finished_at,
    finishedAt.toISOString(),
  );
});
