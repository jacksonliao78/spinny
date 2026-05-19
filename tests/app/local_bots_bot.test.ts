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

test("enumerateLegalPlacements sweeps the lateral axis for horizontal gravity", () => {
  const game = createTestGame();
  game.board.rotate();
  const placements = enumerateLegalPlacements(game, "ring");
  const uniqueY = new Set(placements.map((placement) => placement.y));

  assert.ok(uniqueY.size > 1);
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

test("scorePlacement can value complete rings for spinny bot play", () => {
  const piece = new Piece("O", 0, 0);
  const locked = Array.from({ length: 7 }, () => Array(7).fill(null));
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) locked[y][x] = "solid";
  }
  for (let y = 1; y <= 5; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      if (x > 1 && x < 5 && y > 1 && y < 5) continue;
      locked[y][x] = "I";
    }
  }
  locked[1][1] = null;
  locked[1][2] = null;
  locked[2][1] = null;
  const fullInnerRing = {
    width: 7,
    height: 7,
    viewOffsetX: 0,
    viewOffsetY: 0,
    locked,
  };
  const missingRingCell = {
    ...fullInnerRing,
    locked: fullInnerRing.locked.map((row) => [...row]),
  };
  missingRingCell.locked[1][5] = null;

  assert.ok(scorePlacement(fullInnerRing as any, piece, "ring") > scorePlacement(missingRingCell as any, piece, "ring"));
});
