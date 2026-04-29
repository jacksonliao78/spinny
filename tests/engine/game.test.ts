import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../../engine/game";
import type { BoardModel } from "../../engine/board/types";
import type { Piece } from "../../engine/piece";
import type { GameConfigOverrides } from "../../engine/game/rules";

const testConfig = (overrides: GameConfigOverrides = {}): GameConfigOverrides => ({
  ...overrides,
  board: {
    width: 10,
    height: 20,
    ...overrides.board,
  },
});

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
      isContactLoss: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
      addGarbage: () => 0,
    };
  };

  const game = new Game({
    boardFactory: makeBoard,
    config: testConfig({ gravity: { baseIntervalMs: 800 } }),
  });
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
    isContactLoss: () => false,
    lockPiece: (_piece: Piece) => {},
    clearLines: () => (typeof linesToClear === "function" ? linesToClear() : linesToClear),
    addGarbage: () => 0,
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
      isContactLoss: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
      addGarbage: () => 0,
    };
  };
};

const createGarbageBoardFactory = () => {
  let appliedGarbage = 0;
  return {
    getAppliedGarbage: () => appliedGarbage,
    factory: (width: number, height: number): BoardModel => ({
      width,
      height,
      rotation: 0,
      rotate: () => {},
      gravityDelta: () => [0, 1],
      lateralLeftDelta: () => [-1, 0],
      lateralRightDelta: () => [1, 0],
      getLockedCopy: () => Array.from({ length: height }, () => Array(width).fill(null)),
      canPlace: (_piece, _rotation, _dx, dy) => dy !== 1,
      isContactLoss: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
      addGarbage: (amount) => {
        appliedGarbage += amount;
        return amount;
      },
    }),
  };
};

test("Game scores from clear count and updates snapshot stats", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(2), config: testConfig() });
  game.hardDrop();
  const snap = game.getSnapshot();

  assert.equal(snap.score, 300);
  assert.equal(snap.level, 1);
  assert.equal(snap.combo, 0);
  assert.equal(snap.linesClearedTotal, 2);
});

test("Game awards combo bonuses after consecutive line clears", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(1), config: testConfig() });

  game.hardDrop();
  assert.equal(game.getSnapshot().score, 100);
  assert.equal(game.getSnapshot().combo, 0);

  game.hardDrop();
  const secondClear = game.getSnapshot();
  assert.equal(secondClear.score, 250);
  assert.equal(secondClear.combo, 1);

  game.hardDrop();
  const thirdClear = game.getSnapshot();
  assert.equal(thirdClear.score, 450);
  assert.equal(thirdClear.combo, 2);
});

test("Game resets combo chain on a lock without line clears", () => {
  let lockCount = 0;
  const game = new Game({
    boardFactory: createScoringBoardFactory(() => {
      lockCount += 1;
      return lockCount === 3 ? 0 : 1;
    }),
    config: testConfig(),
  });

  game.hardDrop();
  game.hardDrop();
  assert.equal(game.getSnapshot().combo, 1);

  game.hardDrop();
  const reset = game.getSnapshot();
  assert.equal(reset.combo, 0);
  assert.equal(reset.score, 250);

  game.hardDrop();
  const reopened = game.getSnapshot();
  assert.equal(reopened.combo, 0);
  assert.equal(reopened.score, 350);
});

test("Game increases level and gravity speed with progression", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(4), config: testConfig() });
  const before = game.getSnapshot().gravityIntervalMs;

  game.hardDrop();
  game.hardDrop();
  game.hardDrop();

  const after = game.getSnapshot();
  assert.equal(after.level, 2);
  assert.equal(after.linesClearedTotal, 12);
  assert.ok(after.gravityIntervalMs < before);
});

test("Zen mode has no timer and uses level-one gravity", () => {
  const game = new Game({
    boardFactory: createAccumulatorBoardFactory(3),
    config: testConfig({ mode: { kind: "zen" } }),
  });
  const before = game.getSnapshot();
  const startY = before.active?.y;

  game.tick(before.gravityIntervalMs);
  const after = game.getSnapshot();

  assert.equal(after.gameMode, "zen");
  assert.equal(after.remainingMs, null);
  assert.equal(after.gameOver, false);
  assert.equal(after.gravityIntervalMs, before.gravityIntervalMs);
  assert.equal(after.active?.y, startY === undefined ? undefined : startY + 1);
});

test("Zen mode keeps level and gravity fixed after clears", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(4),
    config: testConfig({ mode: { kind: "zen" } }),
  });
  const before = game.getSnapshot().gravityIntervalMs;

  game.hardDrop();
  game.hardDrop();
  game.hardDrop();

  const after = game.getSnapshot();
  assert.equal(after.level, 1);
  assert.equal(after.linesClearedTotal, 12);
  assert.equal(after.gravityIntervalMs, before);
  assert.equal(after.score, 2550);
});

test("Game ignores enqueued garbage unless garbage is enabled", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(0), config: testConfig() });

  game.enqueueGarbage(3);

  const snap = game.getSnapshot();
  assert.equal(snap.garbageEnabled, false);
  assert.equal(snap.incomingGarbage, 0);
});

test("Game enqueueGarbage updates incoming garbage snapshot when enabled", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ garbage: { enabled: true } }),
  });

  game.enqueueGarbage(3);

  const snap = game.getSnapshot();
  assert.equal(snap.garbageEnabled, true);
  assert.equal(snap.incomingGarbage, 3);
});

test("Game applies capped queued garbage after a lock", () => {
  const garbageBoard = createGarbageBoardFactory();
  const game = new Game({
    boardFactory: garbageBoard.factory,
    config: testConfig({ garbage: { enabled: true, maxPerApply: 1 } }),
  });

  game.enqueueGarbage(3);
  game.hardDrop();
  const snap = game.getSnapshot();

  assert.equal(garbageBoard.getAppliedGarbage(), 1);
  assert.equal(snap.incomingGarbage, 2);
});

test("Timed mode expires and ends the game", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "timed", timedDurationMs: 200 } }),
  });
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
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "timed", timedDurationMs: 120 } }),
  });
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
  const game = new Game({
    boardFactory: createAccumulatorBoardFactory(3),
    config: testConfig({ gravity: { baseIntervalMs: 100 } }),
  });
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
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "timed", timedDurationMs: 300 } }),
  });
  const snap = game.getSnapshot();

  assert.equal(snap.gameMode, "timed");
  assert.equal(typeof snap.gravityIntervalMs, "number");
  assert.equal(snap.remainingMs, 300);
});
