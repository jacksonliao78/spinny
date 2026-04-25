import test from "node:test";
import assert from "node:assert/strict";

import { Hold } from "../../engine/hold";
import { Piece } from "../../engine/piece";

test("Hold stores first piece when empty", () => {
  const hold = new Hold();
  const piece = new Piece("S", 0, 0);
  const returned = hold.hold(piece);

  assert.equal(returned, null);
  assert.equal(hold.getHoldType(), "S");
});

test("Hold swaps with existing held piece", () => {
  const hold = new Hold();
  const first = new Piece("J", 1, 1);
  const second = new Piece("Z", 2, 2);

  hold.hold(first);
  const swappedOut = hold.hold(second);

  assert.equal(swappedOut, first);
  assert.equal(hold.getHoldType(), "Z");
});
