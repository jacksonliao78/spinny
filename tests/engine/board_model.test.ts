import test from "node:test";
import assert from "node:assert/strict";

import { RingBoard } from "../../engine/board/ring";
import type { BoardModel } from "../../engine/board/types";
import { Piece } from "../../engine/piece";

const makeBoard = (width: number, height: number): BoardModel => new RingBoard(width, height);

test("BoardModel getLockedCopy returns an isolated copy", () => {
  const board = makeBoard(7, 7);
  const snapshot = board.getLockedCopy();
  snapshot[0][0] = "I";

  const fresh = board.getLockedCopy();
  assert.equal(fresh[0][0], null);
});

test("BoardModel canPlace enforces bounds and occupied-cell collisions", () => {
  const board = makeBoard(7, 7);
  const piece = new Piece("O", 1, 1);

  assert.equal(board.canPlace(piece, piece.rotation, 0, 0), false);
  assert.equal(board.canPlace(piece, piece.rotation, -1, -1), false);
  assert.equal(board.canPlace(piece, piece.rotation, 3, 3), true);
});

test("BoardModel lockPiece + clearLines are deterministic no-op without full ring", () => {
  const board = makeBoard(7, 7);
  const piece = new Piece("I", 0, 0);

  board.lockPiece(piece);
  const before = board.getLockedCopy();
  const cleared = board.clearLines();
  const after = board.getLockedCopy();

  assert.equal(cleared, 0);
  assert.deepEqual(after, before);
});
