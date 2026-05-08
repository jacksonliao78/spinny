import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../../engine/game";
import type { BoardCell, BoardModel } from "../../engine/board/types";
import { Piece } from "../../engine/piece";
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

const createLockedBoard = (
  lockedCells: [number, number][] = [],
  canPlace: BoardModel["canPlace"] = (_piece, _rotation, _dx, dy) => dy !== 1,
) => {
  return (width: number, height: number): BoardModel => {
    const locked = Array.from({ length: height }, () => Array<BoardCell>(width).fill(null));
    for (const [x, y] of lockedCells) locked[y][x] = "I";
    return {
      width,
      height,
      rotation: 0,
      rotate: () => {},
      gravityDelta: () => [0, 1],
      lateralLeftDelta: () => [-1, 0],
      lateralRightDelta: () => [1, 0],
      getLockedCopy: () => locked.map((row) => [...row]),
      canPlace,
      isContactLoss: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
      addGarbage: () => 0,
    };
  };
};

const createKickedSpinBoard = (options: { allowRightMove?: boolean } = {}) => {
  return (width: number, height: number): BoardModel => {
    let kickAvailable = true;
    return {
      width,
      height,
      rotation: 0,
      rotate: () => {},
      gravityDelta: () => [0, 1],
      lateralLeftDelta: () => [-1, 0],
      lateralRightDelta: () => [1, 0],
      getLockedCopy: () => Array.from({ length: height }, () => Array<BoardCell>(width).fill(null)),
      canPlace: (_piece, rotation, dx, dy) => {
        if (rotation === 1 && dx === -1 && dy === 0 && kickAvailable) {
          kickAvailable = false;
          return true;
        }
        if (dy === 1 || dx === -1 || (dx === 1 && !options.allowRightMove)) return false;
        if (dx === 1 && options.allowRightMove) return true;
        if (rotation === 1 && dx === 0 && dy === 0) return false;
        return dx === 0 && dy === 0;
      },
      isContactLoss: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 0,
      addGarbage: () => 0,
    };
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

test("Game run summary tracks lock and clear distribution counters", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(2), config: testConfig() });
  game.activePiece = new Piece("T", 5, 5);

  game.hardDrop();
  const summary = game.getRunSummary();

  assert.equal(summary.score, 300);
  assert.equal(summary.linesClearedTotal, 2);
  assert.equal(summary.stats.locksPlaced, 1);
  assert.equal(summary.stats.piecesByType.T, 1);
  assert.equal(summary.stats.lineClearsByCount.double, 1);
  assert.equal(summary.stats.lineClearsByCount.zero, 0);
});

test("Game run summary computes derived PPS from duration", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(0), config: testConfig() });

  game.hardDrop();
  game.hardDrop();

  const summary = game.getRunSummary(2_000);
  assert.equal(summary.metrics.speed.durationMs, 2_000);
  assert.equal(summary.metrics.speed.piecesPerSecond, 1);
});

test("Game run summary keeps derived rates safe for zero duration and zero attack", () => {
  const game = new Game({ boardFactory: createScoringBoardFactory(0), config: testConfig() });

  game.hardDrop();

  const summary = game.getRunSummary(0);
  assert.equal(summary.metrics.speed.durationMs, 0);
  assert.equal(summary.metrics.speed.piecesPerSecond, 0);
  assert.equal(summary.metrics.attack.attackTotal, 0);
  assert.equal(summary.metrics.attack.attacksPerMinute, 0);
  assert.equal(summary.metrics.attack.attackPerPiece, 0);
});

test("Game run summary tracks back-to-back on quads and resets on other clears", () => {
  let locks = 0;
  const game = new Game({
    boardFactory: createScoringBoardFactory(() => {
      locks += 1;
      // quad, quad, single, quad -> chain 1,2,0,1
      if (locks === 1) return 4;
      if (locks === 2) return 4;
      if (locks === 3) return 1;
      return 4;
    }),
    config: testConfig(),
  });

  game.hardDrop();
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.chain, 1);
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.maxChain, 1);

  game.hardDrop();
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.chain, 2);
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.maxChain, 2);

  game.hardDrop();
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.chain, 0);
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.maxChain, 2);

  game.hardDrop();
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.chain, 1);
  assert.equal(game.getRunSummary(1_000).metrics.backToBack.maxChain, 2);
});

test("Game run summary increments back-to-back on T-spin clears", () => {
  const boardFactory = (width: number, height: number): BoardModel => {
    const locked = Array.from({ length: height }, () => Array<BoardCell>(width).fill(null));
    // Block 3 corners around T center (x+1,y+2). Piece at (5,5) -> center (6,7).
    locked[6][5] = "I"; // (5,6)
    locked[6][7] = "I"; // (7,6)
    locked[8][5] = "I"; // (5,8)
    return {
      width,
      height,
      rotation: 0,
      rotate: () => {},
      gravityDelta: () => [0, 1],
      lateralLeftDelta: () => [-1, 0],
      lateralRightDelta: () => [1, 0],
      getLockedCopy: () => locked.map((row) => [...row]),
      canPlace: (_piece, _rotation, _dx, dy) => dy !== 1,
      isContactLoss: () => false,
      lockPiece: (_piece: Piece) => {},
      clearLines: () => 2,
      addGarbage: () => 0,
    };
  };

  const game = new Game({ boardFactory, config: testConfig() });
  game.activePiece = new Piece("T", 5, 5);

  game.rotateCw();
  game.hardDrop();

  const summary = game.getRunSummary(1_000);
  assert.deepEqual(game.getSnapshot().lastSpin, { pieceType: "T", kind: "t-spin" });
  assert.equal(summary.metrics.backToBack.chain, 1);
  assert.equal(summary.metrics.backToBack.maxChain, 1);
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
  assert.equal(game.getRunSummary().stats.maxCombo, 2);
});

test("Game run summary tracks drop cells and hold usage", () => {
  const game = new Game({ boardFactory: createAccumulatorBoardFactory(3), config: testConfig() });

  game.softDrop();
  game.hold();
  game.hardDrop();
  const stats = game.getRunSummary().stats;

  assert.equal(stats.softDropCellsTotal, 1);
  assert.equal(stats.holdUses, 1);
  assert.equal(stats.hardDropCellsTotal, 1);
  assert.equal(stats.locksPlaced, 1);
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

test("Game exposes T-spin after locking a rotated T with three blocked corners", () => {
  const game = new Game({
    boardFactory: createLockedBoard([
      [5, 6],
      [7, 6],
      [5, 8],
    ]),
    config: testConfig(),
  });
  game.activePiece = new Piece("T", 5, 5);

  game.rotateCw();
  game.hardDrop();

  assert.deepEqual(game.getSnapshot().lastSpin, { pieceType: "T", kind: "t-spin" });
  assert.equal(game.getRunSummary().stats.tSpinCount, 1);
});

test("Game clears rotation metadata when the piece moves before locking", () => {
  const game = new Game({
    boardFactory: createLockedBoard([
      [5, 6],
      [7, 6],
      [5, 8],
    ]),
    config: testConfig(),
  });
  game.activePiece = new Piece("T", 5, 5);

  game.rotateCw();
  game.moveRight();
  game.hardDrop();

  assert.equal(game.getSnapshot().lastSpin, null);
});

test("Game ignores non-T all-spins when the modifier is disabled", () => {
  const game = new Game({ boardFactory: createKickedSpinBoard(), config: testConfig() });
  game.activePiece = new Piece("L", 5, 5);

  game.rotateCw();
  game.hardDrop();

  assert.equal(game.getSnapshot().lastSpin, null);
});

test("Game exposes non-T all-spins when modifier is enabled and kicked piece is immobile", () => {
  const game = new Game({
    boardFactory: createKickedSpinBoard(),
    config: testConfig({ modifiers: { allSpins: true } }),
  });
  game.activePiece = new Piece("L", 5, 5);

  game.rotateCw();
  game.hardDrop();

  assert.deepEqual(game.getSnapshot().lastSpin, { pieceType: "L", kind: "all-spin" });
  assert.equal(game.getRunSummary().stats.allSpinCount, 1);
});

test("Game does not expose all-spin when kicked piece can still move", () => {
  const game = new Game({
    boardFactory: createKickedSpinBoard({ allowRightMove: true }),
    config: testConfig({ modifiers: { allSpins: true } }),
  });
  game.activePiece = new Piece("L", 5, 5);

  game.rotateCw();
  game.hardDrop();

  assert.equal(game.getSnapshot().lastSpin, null);
});

test("SRS kicks cannot place active minos outside horizontal visible bounds", () => {
  const game = new Game({
    boardFactory: createLockedBoard([], (_piece, rotation, dx, _dy) => rotation === 0 && dx === -1),
    config: testConfig(),
  });
  game.activePiece = new Piece("L", 2, 5);
  game.activePiece.rotation = 3;

  game.rotateCw();

  const snap = game.getSnapshot();
  assert.equal(snap.active?.rotation, 3);
  assert.equal(snap.active?.x, 2);
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

test("Sprint rectangular-style target completes after 40 clear units", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(4),
    config: testConfig({ mode: { kind: "sprint", sprintTargetClears: 40 } }),
  });

  for (let i = 0; i < 9; i += 1) game.hardDrop();
  assert.equal(game.getSnapshot().linesClearedTotal, 36);
  assert.equal(game.getSnapshot().gameOver, false);

  game.hardDrop();
  const complete = game.getSnapshot();
  assert.equal(complete.linesClearedTotal, 40);
  assert.equal(complete.gameOver, true);
  assert.equal(complete.active, null);
});

test("Sprint keeps level at 1 and constant gravity after clears", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(4),
    config: testConfig({ mode: { kind: "sprint", sprintTargetClears: 40 } }),
  });
  const before = game.getSnapshot().gravityIntervalMs;

  game.hardDrop();
  game.hardDrop();
  game.hardDrop();

  const after = game.getSnapshot();
  assert.equal(after.level, 1);
  assert.equal(after.linesClearedTotal, 12);
  assert.equal(after.gravityIntervalMs, before);
});

test("Sprint ring-style target completes after 10 clear units", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(1),
    config: testConfig({ mode: { kind: "sprint", sprintTargetClears: 10 } }),
  });

  for (let i = 0; i < 9; i += 1) game.hardDrop();
  assert.equal(game.getSnapshot().linesClearedTotal, 9);
  assert.equal(game.getSnapshot().gameOver, false);

  game.hardDrop();
  const complete = game.getSnapshot();
  assert.equal(complete.linesClearedTotal, 10);
  assert.equal(complete.gameOver, true);
  assert.equal(complete.active, null);
});

test("Marathon mode has no timer and levels from clear units", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(4),
    config: testConfig({ mode: { kind: "marathon" } }),
  });
  const before = game.getSnapshot().gravityIntervalMs;

  game.tick(1);
  assert.equal(game.getSnapshot().remainingMs, null);
  assert.equal(game.getSnapshot().gameOver, false);

  game.hardDrop();
  game.hardDrop();
  game.hardDrop();

  const after = game.getSnapshot();
  assert.equal(after.gameMode, "marathon");
  assert.equal(after.remainingMs, null);
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

test("Zen mode ignores sprint target config and remains practice-only in the engine", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(4),
    config: testConfig({ mode: { kind: "zen", sprintTargetClears: 4 } }),
  });

  game.hardDrop();
  game.hardDrop();

  const after = game.getSnapshot();
  assert.equal(after.gameMode, "zen");
  assert.equal(after.linesClearedTotal, 8);
  assert.equal(after.gameOver, false);
  assert.equal(after.level, 1);
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
  const stats = game.getRunSummary().stats;
  assert.equal(stats.garbageReceivedEvents, 1);
  assert.equal(stats.garbageReceivedTotal, 3);
  assert.equal(stats.garbageAppliedTotal, 1);
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
  const summary = game.getRunSummary();
  assert.equal(summary.gameOver, true);
  assert.equal(summary.gameMode, "timed");
  assert.equal(summary.remainingMs, 0);
});

test("Game tracks elapsedMs and stops counting after game over", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "timed", timedDurationMs: 200 } }),
  });
  game.tick(50);
  assert.equal(game.getSnapshot().elapsedMs, 50);

  game.tick(50);
  assert.equal(game.getSnapshot().elapsedMs, 100);

  game.tick(200);
  assert.equal(game.getSnapshot().gameOver, true);
  const elapsedAtEnd = game.getSnapshot().elapsedMs;

  game.tick(100);
  assert.equal(game.getSnapshot().elapsedMs, elapsedAtEnd);
});

test("Snapshot includes sprintTargetClears", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "sprint", sprintTargetClears: 25 } }),
  });
  assert.equal(game.getSnapshot().sprintTargetClears, 25);
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

const marathonSurvivalConfig = (): GameConfigOverrides => ({
  mode: { kind: "marathon" },
  garbage: {
    enabled: true,
    holesPerRing: 1,
    maxPerApply: 10,
    survival: {
      tierDurationMs: 60_000,
      intervalsMs: [6_000, 5_000, 4_000, 3_000, 2_000, 1_000],
      linesPerEvent: 1,
    },
  },
});

test("Marathon survival enqueues 1 line after the first interval", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig(marathonSurvivalConfig()),
  });

  game.tick(5_999);
  assert.equal(game.getSnapshot().incomingGarbage, 0);

  game.tick(1);
  const snap = game.getSnapshot();
  assert.equal(snap.incomingGarbage, 1);
  const stats = game.getRunSummary().stats;
  assert.equal(stats.garbageReceivedEvents, 1);
  assert.equal(stats.garbageReceivedTotal, 1);
});

test("Marathon survival shrinks intervals each tier and caps at the last entry", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig(marathonSurvivalConfig()),
  });

  const intervalAt = (elapsedMs: number): number => {
    const fresh = new Game({
      boardFactory: createScoringBoardFactory(0),
      config: testConfig(marathonSurvivalConfig()),
    });
    fresh.tick(elapsedMs);
    return fresh.getSnapshot().survival!.intervalMs;
  };

  assert.equal(intervalAt(0), 6_000);
  assert.equal(intervalAt(60_000), 5_000);
  assert.equal(intervalAt(120_000), 4_000);
  assert.equal(intervalAt(180_000), 3_000);
  assert.equal(intervalAt(240_000), 2_000);
  assert.equal(intervalAt(300_000), 1_000);
  assert.equal(intervalAt(900_000), 1_000);

  // Sanity: same instance also reports the cap interval after long elapsedMs.
  game.tick(900_000);
  assert.equal(game.getSnapshot().survival!.intervalMs, 1_000);
});

test("Marathon survival populates snapshot countdown when active", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig(marathonSurvivalConfig()),
  });

  game.tick(2_000);
  const snap = game.getSnapshot();
  assert.ok(snap.survival);
  assert.equal(snap.survival!.active, true);
  assert.equal(snap.survival!.intervalMs, 6_000);
  assert.equal(snap.survival!.linesPerEvent, 1);
  assert.equal(snap.survival!.msUntilNext, 4_000);
});

test("Survival snapshot is null for non-survival modes", () => {
  const timed = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "timed", timedDurationMs: 60_000 } }),
  });
  assert.equal(timed.getSnapshot().survival, null);

  const sprint = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "sprint", sprintTargetClears: 40 } }),
  });
  assert.equal(sprint.getSnapshot().survival, null);

  const zen = new Game({
    boardFactory: createScoringBoardFactory(0),
    config: testConfig({ mode: { kind: "zen" } }),
  });
  assert.equal(zen.getSnapshot().survival, null);
});

test("Line clears never cancel queued garbage", () => {
  const game = new Game({
    boardFactory: createScoringBoardFactory(2),
    config: testConfig({
      mode: { kind: "marathon" },
      garbage: { enabled: true, maxPerApply: 1 },
    }),
  });

  game.enqueueGarbage(5);
  assert.equal(game.getSnapshot().incomingGarbage, 5);

  game.hardDrop();
  const snap = game.getSnapshot();
  assert.equal(snap.linesClearedTotal, 2);
  assert.equal(snap.incomingGarbage, 5);
});

test("Marathon survival drains backlog on lock when maxPerApply allows", () => {
  const garbageBoard = createGarbageBoardFactory();
  const game = new Game({
    boardFactory: garbageBoard.factory,
    config: testConfig(marathonSurvivalConfig()),
  });

  // Three 6s intervals elapse during the tick; tick-time drain applies the backlog as it rises.
  game.tick(18_000);

  assert.equal(garbageBoard.getAppliedGarbage(), 3);
  assert.equal(game.getSnapshot().incomingGarbage, 0);
  const stats = game.getRunSummary().stats;
  assert.equal(stats.garbageReceivedEvents, 3);
  assert.equal(stats.garbageReceivedTotal, 3);
  assert.equal(stats.garbageAppliedTotal, 3);
});

test("Marathon survival applies garbage on tick before any piece locks", () => {
  const garbageBoard = createGarbageBoardFactory();
  const game = new Game({
    boardFactory: garbageBoard.factory,
    config: testConfig(marathonSurvivalConfig()),
  });

  // 6s elapses without any lock yet; player should already see one garbage line.
  game.tick(6_000);

  assert.equal(garbageBoard.getAppliedGarbage(), 1);
  assert.equal(game.getSnapshot().incomingGarbage, 0);
  assert.equal(game.getRunSummary().stats.garbageAppliedTotal, 1);
});

test("Active piece rides the rising stack when garbage applies mid-air", () => {
  // Each addGarbage(amount) raises a virtual wall by `amount`; canPlace fails when piece.y >= wallY.
  let wallY = Number.POSITIVE_INFINITY;
  const factory = (_width: number, height: number): BoardModel => ({
    width: 0,
    height,
    rotation: 0,
    rotate: () => {},
    gravityDelta: () => [0, 1],
    lateralLeftDelta: () => [-1, 0],
    lateralRightDelta: () => [1, 0],
    getLockedCopy: () => Array.from({ length: height }, () => Array<BoardCell>(0)),
    canPlace: (piece, _rotation, _dx, dy) => {
      if (dy === 1) return false;
      return piece.y + dy < wallY;
    },
    isContactLoss: () => false,
    lockPiece: () => {},
    clearLines: () => 0,
    addGarbage: (amount) => {
      wallY -= amount;
      return amount;
    },
  });

  const game = new Game({
    boardFactory: factory,
    config: testConfig({
      mode: { kind: "marathon" },
      garbage: { enabled: true, maxPerApply: 1 },
    }),
  });
  const startY = game.activePiece?.y;
  assert.ok(typeof startY === "number");
  // Position the wall one row beneath the piece; addGarbage(1) brings it to the piece's row.
  wallY = startY! + 1;

  game.enqueueGarbage(1);
  game.tick(0);

  const after = game.getSnapshot();
  assert.equal(after.gameOver, false);
  assert.equal(after.active?.y, startY! - 1);
});

test("Run ends when garbage applies and the active piece can no longer fit", () => {
  let topOut = false;
  const factory = (_width: number, height: number): BoardModel => ({
    width: 0,
    height,
    rotation: 0,
    rotate: () => {},
    gravityDelta: () => [0, 1],
    lateralLeftDelta: () => [-1, 0],
    lateralRightDelta: () => [1, 0],
    getLockedCopy: () => Array.from({ length: height }, () => Array<BoardCell>(0)),
    canPlace: (_piece, _rotation, _dx, _dy) => !topOut,
    isContactLoss: () => false,
    lockPiece: () => {},
    clearLines: () => 0,
    addGarbage: (amount) => {
      topOut = true;
      return amount;
    },
  });

  const game = new Game({
    boardFactory: factory,
    config: testConfig({
      mode: { kind: "marathon" },
      garbage: { enabled: true, maxPerApply: 1 },
    }),
  });

  game.enqueueGarbage(1);
  game.tick(0);

  assert.equal(game.getSnapshot().gameOver, true);
});
