import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../../engine/game";
import { createBoard } from "../../engine/board/factory";
import { createSeededRandom } from "../../engine/random";
import { Piece } from "../../engine/piece";
import { chooseBotPlacement, enumerateLegalPlacements, scorePlacement } from "../../app/localBots/bot";
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
  assert.equal(placement.x, 5);
});

test("enumerateLegalPlacements returns no placements after game over", () => {
  const game = {
    getSnapshot: () => ({ active: null, gameOver: true }),
  };

  assert.deepEqual(enumerateLegalPlacements(game as any), []);
});

test("bot placement search is deterministic for the same seed", () => {
  const first = chooseBotPlacement(createTestGame());
  const second = chooseBotPlacement(createTestGame());

  assert.deepEqual(first, second);
});

test("scorePlacement prefers a line clear over a similar non-clear", () => {
  const piece = new Piece("O", 1, 1);
  const clearSnap = {
    width: 4,
    height: 4,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked: [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      ["I", "I", null, null],
    ],
  };
  const noClearSnap = {
    ...clearSnap,
    locked: clearSnap.locked.map((row) => [...row]),
  };
  noClearSnap.locked[3][0] = null;

  assert.ok(scorePlacement(clearSnap as any, piece) > scorePlacement(noClearSnap as any, piece));
});

test("scorePlacement scores clears using visible play columns, not spawn padding", () => {
  const piece = new Piece("O", 3, 1);
  const clearSnap = {
    width: 4,
    height: 4,
    viewOffsetX: 2,
    viewOffsetY: 0,
    locked: [
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, "I", "I", null, null, null, null],
    ],
  };
  const noClearSnap = {
    ...clearSnap,
    locked: clearSnap.locked.map((row) => [...row]),
  };
  noClearSnap.locked[3][2] = null;

  assert.ok(scorePlacement(clearSnap as any, piece) > scorePlacement(noClearSnap as any, piece));
});

test("scorePlacement ignores bottom padding when evaluating grounded pieces", () => {
  const snap = {
    width: 10,
    height: 20,
    viewOffsetX: 2,
    viewOffsetY: 2,
    locked: Array.from({ length: 24 }, () => Array(14).fill(null)),
  };
  const horizontalFloor = new Piece("I", 5, 20);
  horizontalFloor.rotation = 0;
  const verticalWall = new Piece("I", 0, 18);
  verticalWall.rotation = 1;

  assert.ok(scorePlacement(snap as any, horizontalFloor) > scorePlacement(snap as any, verticalWall));
});

test("scorePlacement penalizes holes", () => {
  const piece = new Piece("O", 1, 1);
  const cleanSnap = {
    width: 4,
    height: 4,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked: [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ],
  };
  const holeSnap = {
    ...cleanSnap,
    locked: [
      [null, null, null, null],
      ["I", null, null, null],
      [null, null, null, null],
      ["I", null, null, null],
    ],
  };

  assert.ok(scorePlacement(cleanSnap as any, piece) > scorePlacement(holeSnap as any, piece));
});
