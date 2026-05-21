import test from "node:test";
import assert from "node:assert/strict";

import type { RunSummary } from "../../engine/game";
import { createRunStats } from "../../engine/game/run_stats";
import {
  buildPlayerMatchResultViewModel,
  buildSpectatorMatchResultViewModel,
} from "../../app/multiplayer/matchSummary";
import type { MultiplayerSnapshotPayload } from "../../app/multiplayer/snapshots";

const makeSummary = (): RunSummary => {
  const stats = createRunStats();
  stats.locksPlaced = 42;
  return {
    width: 10,
    height: 20,
    gameMode: "versus",
    score: 3200,
    level: 1,
    linesClearedTotal: 18,
    remainingMs: null,
    gameOver: true,
    stats,
    metrics: {
      speed: {
        durationMs: 30_000,
        piecesPerSecond: 1.4,
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
  };
};

const makeSnapshot = (
  slot: 1 | 2,
  userId: string,
  username: string,
  overrides: Partial<MultiplayerSnapshotPayload> = {},
): MultiplayerSnapshotPayload => ({
  version: 3,
  roomId: "room-1",
  userId,
  username,
  slot,
  sentAt: 123,
  width: 10,
  height: 20,
  fullWidth: 14,
  fullHeight: 24,
  viewOffsetX: 2,
  viewOffsetY: 2,
  score: 1200,
  lines: 8,
  pieces: 20,
  pps: 1.1,
  incomingGarbage: 0,
  hold: null,
  next: [],
  gameOver: false,
  cells: [],
  ...overrides,
});

test("player match summary renders win/loss result stats", () => {
  const opponent = makeSnapshot(2, "opponent", "Opponent", { score: 900, lines: 6, pps: 0.95 });
  const view = buildPlayerMatchResultViewModel(true, makeSummary(), 30_000, "rectangular", opponent);

  assert.equal(view.headline, "You Win");
  assert.equal(view.subhead, "Versus / Regular");
  assert.equal(view.primaryLabel, "Result");
  assert.equal(view.primaryValue, "Winner");
  assert.equal(view.outcome, "win");
  assert.equal(view.stats.find((stat) => stat.label === "Your Lines")?.value, "18");
  assert.equal(view.stats.find((stat) => stat.label === "Opponent Score")?.value, "900");
  assert.equal(view.stats.find((stat) => stat.label === "Opponent PPS")?.value, "0.95");
});

test("spectator match summary chooses the non-losing player as winner", () => {
  const left = makeSnapshot(1, "p1", "Alice", { lines: 10, score: 2400, pps: 1.5 });
  const right = makeSnapshot(2, "p2", "Bea", { lines: 7, score: 1500, pps: 1.2 });
  const view = buildSpectatorMatchResultViewModel("p2", "Bea", left, right, { 1: "Alice", 2: "Bea" });

  assert.equal(view.headline, "Alice Wins");
  assert.equal(view.subhead, "Versus / Spectating");
  assert.equal(view.primaryValue, "Bea");
  assert.equal(view.stats.find((stat) => stat.label === "P1 Score")?.value, "2400");
  assert.equal(view.stats.find((stat) => stat.label === "P2 PPS")?.value, "1.20");
});

test("spectator match summary uses lobby names when the winner snapshot is missing", () => {
  const left = makeSnapshot(1, "p1", "Alice");
  const view = buildSpectatorMatchResultViewModel("p1", "Alice", left, null, { 1: "Alice", 2: "Bea" });

  assert.equal(view.headline, "Bea Wins");
  assert.equal(view.primaryValue, "Alice");
  assert.equal(view.stats.find((stat) => stat.label === "P2 Score")?.value, "0");
});
