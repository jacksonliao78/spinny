import test from "node:test";
import assert from "node:assert/strict";

import { RingBoard } from "../../engine/board/ring";

test("Board gravity and lateral deltas follow rotation", () => {
  const board = new RingBoard(10, 20);
  const expected = [
    { gravity: [0, 1], left: [-1, 0], right: [1, 0] },
    { gravity: [1, 0], left: [0, 1], right: [0, -1] },
    { gravity: [0, -1], left: [1, 0], right: [-1, 0] },
    { gravity: [-1, 0], left: [0, -1], right: [0, 1] },
  ] as const;

  for (let rot = 0; rot < 4; rot++) {
    board.rotation = rot;
    const normalize = (v: [number, number]) => v.map((n) => (n === 0 ? 0 : n));
    assert.deepEqual(normalize(board.gravityDelta()), expected[rot].gravity);
    assert.deepEqual(normalize(board.lateralLeftDelta()), expected[rot].left);
    assert.deepEqual(normalize(board.lateralRightDelta()), expected[rot].right);
  }
});

test("Board clearLines clears a full ring and keeps center obstacle intact", () => {
  const board = new RingBoard(7, 7);
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const inCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (inCenter) continue;
      const ring = Math.max(Math.abs(x - 3) - 1, Math.abs(y - 3) - 1);
      if (ring === 1) board.board[y][x] = "I";
    }
  }

  const cleared = board.clearLines();
  assert.equal(cleared, 1);
  assert.equal(board.board[3][2], 1);
  assert.equal(board.board[3][3], 1);
  assert.equal(board.board[3][4], 1);
});

test("Board clearLines shrink deletes outer-ring corners", () => {
  const board = new RingBoard(7, 7);
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const inCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (inCenter) continue;
      const ring = Math.max(Math.abs(x - 3) - 1, Math.abs(y - 3) - 1);
      if (ring === 1) board.board[y][x] = "I";
    }
  }
  board.board[0][0] = "T";
  board.board[0][3] = "T";

  const cleared = board.clearLines();
  assert.equal(cleared, 1);
  assert.equal(board.board[0][0], null);
  assert.equal(board.board[1][3], "T");
});
