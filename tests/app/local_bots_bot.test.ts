import test from "node:test";
import assert from "node:assert/strict";

import { Game, type GameSnapshot } from "../../engine/game";
import { createBoard } from "../../engine/board/factory";
import type { BoardCell } from "../../engine/board/types";
import { createSeededRandom } from "../../engine/random";
import { Piece } from "../../engine/piece";
import {
  chooseBotPlacement,
  createBotController,
  enumerateLegalPlacements,
  scoreBotBPlacement,
  scorePlacement,
} from "../../app/localBots/bot";
import { RECTANGULAR_BOARD_CONFIG } from "../../app/constants";

const createTestGame = (): Game =>
  new Game({
    random: createSeededRandom("bot-test"),
    boardFactory: (width, height, random) => createBoard("rectangular", width, height, random),
    config: {
      board: RECTANGULAR_BOARD_CONFIG,
      mode: { kind: "versus" },
    },
  });

const cells = (rows: BoardCell[][]): BoardCell[][] => rows;

const emptyGrid = (rows: number, cols: number): BoardCell[][] =>
  Array.from({ length: rows }, () => Array<BoardCell>(cols).fill(null));

const makeSnapshot = (overrides: Partial<GameSnapshot> = {}): GameSnapshot => {
  const width = overrides.width ?? 4;
  const height = overrides.height ?? 4;
  const viewOffsetX = overrides.viewOffsetX ?? 0;
  const viewOffsetY = overrides.viewOffsetY ?? 0;
  return {
    width,
    height,
    viewOffsetX,
    viewOffsetY,
    boardRotation: 0,
    locked: overrides.locked ?? emptyGrid(viewOffsetY + height, viewOffsetX + width),
    active: null,
    next: [],
    hold: null,
    score: 0,
    level: 1,
    combo: 0,
    b2b: 0,
    piecesPlaced: 0,
    piecesPerSecond: 0,
    linesClearedTotal: 0,
    garbageEnabled: true,
    incomingGarbage: 0,
    survival: null,
    gameMode: "versus",
    remainingMs: null,
    elapsedMs: 0,
    sprintTargetClears: 40,
    gravityIntervalMs: 1000,
    lastSpin: null,
    gameOver: false,
    ...overrides,
  };
};

const makeGameOverPlacementSearchGame = () => ({
  board: {
    gravityDelta: (): [number, number] => [0, 1],
    lateralRightDelta: (): [number, number] => [1, 0],
  },
  getSnapshot: () => makeSnapshot({ active: null, gameOver: true }),
  canMovePiece: () => false,
});

test("chooseBotPlacement returns a legal placement for an active game", () => {
  const game = createTestGame();
  const placement = chooseBotPlacement(game);

  assert.ok(placement);
  assert.equal(Number.isInteger(placement.x), true);
  assert.equal(Number.isInteger(placement.y), true);
  assert.equal(placement.rotation >= 0 && placement.rotation < 4, true);
});

test("chooseBotPlacement prefers a grounded floor placement over a wall tuck on an empty board", () => {
  const game = createTestGame();
  const placement = chooseBotPlacement(game);

  assert.ok(placement);
  assert.equal(placement.rotation, 0);
  assert.equal(placement.y, 20);
  assert.equal(placement.x >= 2 && placement.x <= 8, true);
});

test("enumerateLegalPlacements returns no placements after game over", () => {
  assert.deepEqual(enumerateLegalPlacements(makeGameOverPlacementSearchGame()), []);
});

test("bot placement search is deterministic for the same seed", () => {
  const first = chooseBotPlacement(createTestGame());
  const second = chooseBotPlacement(createTestGame());

  assert.deepEqual(first, second);
});

test("createBotController uses target PPS as a piece placement clock", () => {
  const game = createTestGame();
  const bot = createBotController({ targetPps: 2 });

  bot.update(game, 499);
  assert.equal(game.getSnapshot().piecesPlaced, 0);

  bot.update(game, 1);
  assert.equal(game.getSnapshot().piecesPlaced, 1);

  bot.update(game, 500);
  assert.equal(game.getSnapshot().piecesPlaced, 2);
});

test("bot exact placement locks the selected legal placement", () => {
  const game = createTestGame();
  const placement = chooseBotPlacement(game);
  const type = game.getSnapshot().active?.type;

  assert.ok(placement);
  assert.ok(type);
  assert.equal(game.placeActivePieceAt(placement.x, placement.y, placement.rotation), true);

  const locked = game.getSnapshot().locked;
  const placed = new Piece(type, placement.x, placement.y);
  placed.rotation = placement.rotation;
  for (const [rowIdx, row] of placed.getShape(placed.rotation).entries()) {
    for (const [colIdx, cell] of row.entries()) {
      if (!cell) continue;
      assert.equal(locked[placement.y + rowIdx][placement.x + colIdx], type);
    }
  }
});

test("scorePlacement prefers a line clear over a similar non-clear", () => {
  const piece = new Piece("O", 1, 1);
  const clearSnap = makeSnapshot({
    width: 4,
    height: 4,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked: cells([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      ["I", "I", null, null],
    ]),
  });
  const noClearSnap = makeSnapshot({
    ...clearSnap,
    locked: clearSnap.locked.map((row) => [...row]),
  });
  noClearSnap.locked[3][0] = null;

  assert.ok(scorePlacement(clearSnap, piece) > scorePlacement(noClearSnap, piece));
});

test("scorePlacement scores clears using visible play columns, not spawn padding", () => {
  const piece = new Piece("O", 3, 1);
  const clearSnap = makeSnapshot({
    width: 4,
    height: 4,
    viewOffsetX: 2,
    viewOffsetY: 0,
    locked: cells([
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, "I", "I", null, null, null, null],
    ]),
  });
  const noClearSnap = makeSnapshot({
    ...clearSnap,
    locked: clearSnap.locked.map((row) => [...row]),
  });
  noClearSnap.locked[3][2] = null;

  assert.ok(scorePlacement(clearSnap, piece) > scorePlacement(noClearSnap, piece));
});

test("scorePlacement strongly prefers quads over smaller clears", () => {
  const makeSnap = () => makeSnapshot({
    width: 10,
    height: 20,
    viewOffsetX: 2,
    viewOffsetY: 2,
    locked: emptyGrid(24, 14),
  });
  const quadSnap = makeSnap();
  for (let y = 18; y <= 21; y += 1) {
    for (let x = 2; x <= 11; x += 1) {
      if (x !== 7) quadSnap.locked[y][x] = "I";
    }
  }
  const quadPiece = new Piece("I", 5, 18);
  quadPiece.rotation = 1;

  const singleSnap = makeSnap();
  for (let x = 2; x <= 11; x += 1) {
    if (x < 5 || x > 8) singleSnap.locked[21][x] = "I";
  }
  const singlePiece = new Piece("I", 5, 20);
  singlePiece.rotation = 0;

  assert.ok(scorePlacement(quadSnap, quadPiece) > scorePlacement(singleSnap, singlePiece));
});

test("scorePlacement rewards plausible T-spin clears", () => {
  const baseSnap = makeSnapshot({
    width: 4,
    height: 4,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked: emptyGrid(4, 4),
    combo: 0,
    b2b: 0,
  });
  const spinSnap = makeSnapshot({
    ...baseSnap,
    locked: baseSnap.locked.map((row) => [...row]),
  });
  spinSnap.locked[1][0] = "I";
  spinSnap.locked[1][2] = "I";
  spinSnap.locked[2][3] = "I";
  spinSnap.locked[3][0] = "I";

  const regularSnap = makeSnapshot({
    ...baseSnap,
    locked: baseSnap.locked.map((row) => [...row]),
  });
  regularSnap.locked[2][3] = "I";

  const piece = new Piece("T", 0, 0);

  assert.ok(scorePlacement(spinSnap, piece) > scorePlacement(regularSnap, piece));
});

test("scorePlacement ignores bottom padding when evaluating grounded pieces", () => {
  const snap = makeSnapshot({
    width: 10,
    height: 20,
    viewOffsetX: 2,
    viewOffsetY: 2,
    locked: emptyGrid(24, 14),
  });
  const horizontalFloor = new Piece("I", 5, 20);
  horizontalFloor.rotation = 0;
  const verticalWall = new Piece("I", 0, 18);
  verticalWall.rotation = 1;

  assert.ok(scorePlacement(snap, horizontalFloor) > scorePlacement(snap, verticalWall));
});

test("scorePlacement penalizes holes", () => {
  const piece = new Piece("O", 1, 1);
  const cleanSnap = makeSnapshot({
    width: 4,
    height: 4,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked: cells([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]),
  });
  const holeSnap = makeSnapshot({
    ...cleanSnap,
    locked: cells([
      [null, null, null, null],
      ["I", null, null, null],
      [null, null, null, null],
      ["I", null, null, null],
    ]),
  });

  assert.ok(scorePlacement(cleanSnap, piece) > scorePlacement(holeSnap, piece));
});

test("Bot B strongly prefers safer boards over high-hole boards", () => {
  const piece = new Piece("O", 1, 1);
  const cleanSnap = makeSnapshot({
    width: 4,
    height: 4,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked: cells([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]),
    combo: 0,
    b2b: 0,
    incomingGarbage: 0,
  });
  const messySnap = makeSnapshot({
    ...cleanSnap,
    locked: cells([
      ["I", null, "I", null],
      ["I", null, "I", null],
      [null, null, null, null],
      ["I", null, "I", null],
    ]),
  });

  assert.ok(scoreBotBPlacement(cleanSnap, piece) > scoreBotBPlacement(messySnap, piece));
});

test("Bot B prefers attack-producing placements when survival cost is reasonable", () => {
  const makeSnap = () => makeSnapshot({
    width: 10,
    height: 20,
    viewOffsetX: 2,
    viewOffsetY: 2,
    locked: emptyGrid(24, 14),
    combo: 0,
    b2b: 1,
    incomingGarbage: 0,
  });
  const quadSnap = makeSnap();
  for (let y = 18; y <= 21; y += 1) {
    for (let x = 2; x <= 11; x += 1) {
      if (x !== 7) quadSnap.locked[y][x] = "I";
    }
  }
  const quadPiece = new Piece("I", 5, 18);
  quadPiece.rotation = 1;

  const flatSnap = makeSnap();
  const flatPiece = new Piece("I", 5, 20);
  flatPiece.rotation = 0;

  assert.ok(scoreBotBPlacement(quadSnap, quadPiece) > scoreBotBPlacement(flatSnap, flatPiece));
});
