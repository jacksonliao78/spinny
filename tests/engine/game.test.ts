import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../../engine/game";
import type { BoardModel } from "../../engine/board/types";
import type { Piece } from "../../engine/piece";
import type { GameConfig } from "../../engine/game/rules";

test("Game uses provided board factory", () => {
  let createdWidth = -1;
  let createdHeight = -1;

  const makeBoard = (width: number, height: number): BoardModel => {
    createdWidth = width;
    createdHeight = height;
    return {
      width,
      height,
      rotation: 0,
      rotate: () => {},
      gravityDelta: () => [0, 1],
      lateralLeftDelta: () => [-1, 0],
      lateralRightDelta: () => [1, 0],
      getLockedCopy: () => Array.from({ length: height }, () => Array(width).fill(null)),
      canPlace: () => true,
      isBottomBordered: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
    };
  };

  const game = new Game(10, 20, 800, makeBoard);
  assert.equal(createdWidth, 14);
  assert.equal(createdHeight, 24);
  assert.equal(game.board.width, 14);
  assert.equal(game.board.height, 24);
});

const createScoringBoardFactory = (linesToClear: number | (() => number)) => {
  return (width: number, height: number): BoardModel => ({
    width,
    height,
    rotation: 0,
    rotate: () => {},
    gravityDelta: () => [0, 1],
    lateralLeftDelta: () => [-1, 0],
    lateralRightDelta: () => [1, 0],
    getLockedCopy: () => Array.from({ length: height }, () => Array(width).fill(null)),
    canPlace: (_piece, _rotation, _dx, dy) => dy !== 1,
    isBottomBordered: () => false,
    lockPiece: (_piece: Piece) => {},
    clearLines: () => (typeof linesToClear === "function" ? linesToClear() : linesToClear),
  });
};

const createAccumulatorBoardFactory = (allowedDownwardMoves: number) => {
  return (width: number, height: number): BoardModel => {
    let remainingDownwardMoves = allowedDownwardMoves;
    return {
      width,
      height,
      rotation: 0,
      rotate: () => {},
      gravityDelta: () => [0, 1],
      lateralLeftDelta: () => [-1, 0],
      lateralRightDelta: () => [1, 0],
      getLockedCopy: () => Array.from({ length: height }, () => Array(width).fill(null)),
      canPlace: (_piece, _rotation, _offsetX, offsetY) => {
        if (offsetY !== 1) return true;
        if (remainingDownwardMoves > 0) {
          remainingDownwardMoves -= 1;
          return true;
        }
        return false;
      },
      isBottomBordered: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
    };
  };
};

test("Game scores from clear count and updates snapshot stats", () => {
  const game = new Game(10, 20, 700, createScoringBoardFactory(2));
  game.hardDrop();
  const snap = game.getSnapshot();

  assert.equal(snap.score, 300);
  assert.equal(snap.level, 1);
  assert.equal(snap.linesClearedTotal, 2);
});

test("Game increases level and gravity speed with progression", () => {
  const game = new Game(10, 20, 700, createScoringBoardFactory(4));
  const before = game.getSnapshot().gravityIntervalMs;

  game.hardDrop();
  game.hardDrop();
  game.hardDrop();

  const after = game.getSnapshot();
  assert.equal(after.level, 2);
  assert.equal(after.linesClearedTotal, 12);
  assert.ok(after.gravityIntervalMs < before);
});

test("Timed mode expires and ends the game", () => {
  const config: Partial<GameConfig> = {
    mode: "timed",
    timed: { durationMs: 200 },
  };
  const game = new Game(10, 20, 700, createScoringBoardFactory(0), config);
  game.tick(100);
  let snap = game.getSnapshot();
  assert.equal(snap.gameOver, false);
  assert.equal(snap.remainingMs, 100);

  game.tick(100);
  snap = game.getSnapshot();
  assert.equal(snap.gameOver, true);
  assert.equal(snap.remainingMs, 0);
});

test("Timed mode clamps overshoot and is idempotent after expiry", () => {
  const config: Partial<GameConfig> = {
    mode: "timed",
    timed: { durationMs: 120 },
  };
  const game = new Game(10, 20, 700, createScoringBoardFactory(0), config);
  game.tick(500);
  const expired = game.getSnapshot();
  assert.equal(expired.gameOver, true);
  assert.equal(expired.remainingMs, 0);
  assert.equal(expired.active, null);

  game.tick(300);
  const after = game.getSnapshot();
  assert.equal(after.gameOver, true);
  assert.equal(after.remainingMs, 0);
  assert.equal(after.active, null);
  assert.equal(after.score, expired.score);
  assert.equal(after.linesClearedTotal, expired.linesClearedTotal);
});

test("Gravity accumulator carries remainder across ticks", () => {
  const game = new Game(10, 20, 100, createAccumulatorBoardFactory(3));
  const before = game.getSnapshot().score;

  game.tick(50);
  game.tick(50);
  game.tick(250);

  const snap = game.getSnapshot();
  assert.equal(snap.gameOver, false);
  // Should eventually lock after exactly 3 downward moves and not award score (no clears/drops).
  assert.equal(snap.score, before);
});

test("Snapshot includes mode and timer fields", () => {
  const config: Partial<GameConfig> = {
    mode: "timed",
    timed: { durationMs: 300 },
  };
  const game = new Game(10, 20, 700, createScoringBoardFactory(0), config);
  const snap = game.getSnapshot();

  assert.equal(snap.gameMode, "timed");
  assert.equal(typeof snap.gravityIntervalMs, "number");
  assert.equal(snap.remainingMs, 300);
});
