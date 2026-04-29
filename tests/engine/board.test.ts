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

test("Board clearLines clears all rings full in initial pass", () => {
  const board = new RingBoard(9, 9);

  // Fill ring 1 and ring 2 so two clears must be processed in one lock.
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const ring = Math.max(Math.abs(x - 4) - 1, Math.abs(y - 4) - 1);
      if (ring === 1 || ring === 2) board.board[y][x] = "I";
    }
  }

  const cleared = board.clearLines();
  assert.equal(cleared, 2);
});

test("Board clearLines shifting inward deletes corners on promoted ring", () => {
  const board = new RingBoard(9, 9);

  // Fill ring 1 so it clears.
  for (let y = 2; y <= 6; y++) {
    for (let x = 2; x <= 6; x++) {
      if (x === 2 || x === 6 || y === 2 || y === 6) board.board[y][x] = "I";
    }
  }

  // Put only ring-2 corners plus one edge cell to track what survives shrink.
  board.board[1][1] = "T";
  board.board[1][7] = "T";
  board.board[7][1] = "T";
  board.board[7][7] = "T";
  board.board[1][4] = "L";

  const cleared = board.clearLines();
  assert.equal(cleared, 1);

  // Ring-2 corners should be deleted when they become ring 1.
  assert.equal(board.board[2][2], null);
  assert.equal(board.board[2][6], null);
  assert.equal(board.board[6][2], null);
  assert.equal(board.board[6][6], null);

  // A non-corner ring-2 cell should move inward by one.
  assert.equal(board.board[2][4], "L");
});

test("Board clearLines prune removes cells without inward support chain", () => {
  const board = new RingBoard(9, 9);

  // Fill ring 1 so one clear happens.
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const ring = Math.max(Math.abs(x - 4) - 1, Math.abs(y - 4) - 1);
      if (ring === 1) board.board[y][x] = "I";
    }
  }

  // This shifts from ring 3 -> ring 2, but has no inward support and gets pruned.
  board.board[0][4] = "T";

  const cleared = board.clearLines();
  assert.equal(cleared, 1);
  assert.equal(board.board[1][4], null);
});

test("Board addGarbage fills outer ring with holes only", () => {
  const board = new RingBoard(7, 7);

  const applied = board.addGarbage(1, 4);

  assert.equal(applied, 1);
  assert.equal(board.board[0][0], null);
  assert.equal(board.board[0][6], null);
  assert.equal(board.board[3][6], null);
  assert.equal(board.board[6][1], null);
  assert.equal(board.board[0][1], 1);
  assert.equal(board.board[1][0], 1);
  assert.equal(board.board[6][6], 1);
  assert.equal(board.board[1][1], null);
  assert.equal(board.board[3][3], 1);
});

test("Board addGarbage does not overwrite existing locked cells", () => {
  const board = new RingBoard(7, 7);
  board.board[0][1] = "T";

  const applied = board.addGarbage(1, 4);

  assert.equal(applied, 1);
  assert.equal(board.board[0][1], "T");
});

test("Board addGarbage returns zero when no cells can be added", () => {
  const board = new RingBoard(7, 7);
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (x === 0 || x === board.width - 1 || y === 0 || y === board.height - 1) {
        board.board[y][x] = "I";
      }
    }
  }

  const applied = board.addGarbage(1, 4);

  assert.equal(applied, 0);
});
