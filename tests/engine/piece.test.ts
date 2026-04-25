import test from "node:test";
import assert from "node:assert/strict";

import { Piece } from "../../engine/piece";

test("Piece move updates x and y coordinates", () => {
  const piece = new Piece("T", 4, 8);
  piece.move(-2, 3);
  assert.equal(piece.x, 2);
  assert.equal(piece.y, 11);
});

test("Piece rotate normalizes positive and negative turns", () => {
  const piece = new Piece("L", 0, 0);
  piece.rotate(5);
  assert.equal(piece.rotation, 1);
  piece.rotate(-2);
  assert.equal(piece.rotation, 3);
});

test("Piece get_shape returns the requested rotation grid", () => {
  const piece = new Piece("I", 0, 0);
  const shape = piece.get_shape(1);
  assert.equal(shape[0][2], 1);
  assert.equal(shape[1][2], 1);
  assert.equal(shape[2][2], 1);
  assert.equal(shape[3][2], 1);
});
