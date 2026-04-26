import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../../engine/game";
import type { BoardModel } from "../../engine/board/types";
import type { Piece } from "../../engine/piece";

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
