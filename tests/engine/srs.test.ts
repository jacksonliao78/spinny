import test from "node:test";
import assert from "node:assert/strict";

import { getKicks, normalizeRotation, tryKicks } from "../../engine/srs";

test("normalizeRotation wraps negative and large values", () => {
  assert.equal(normalizeRotation(-1), 3);
  assert.equal(normalizeRotation(8), 0);
  assert.equal(normalizeRotation(11), 3);
});

test("getKicks returns expected defaults for O and I pieces", () => {
  assert.deepEqual(getKicks("O", 0, 1, "cw"), [[0, 0]]);

  const iKicks = getKicks("I", 0, 1, "cw");
  assert.equal(iKicks.length, 5);
  assert.deepEqual(iKicks[0], [0, 0]);
  assert.deepEqual(iKicks[1], [-2, 0]);
});

test("tryKicks picks first valid kick or null", () => {
  const placed = tryKicks({
    pieceType: "T",
    fromRot: 0,
    toRot: 1,
    spin: "cw",
    baseX: 10,
    baseY: 5,
    canPlace: (rot, x, y) => rot === 1 && x === 9 && y === 5,
  });
  assert.deepEqual(placed, { x: 9, y: 5, rot: 1, usedKick: [-1, 0] });

  const blocked = tryKicks({
    pieceType: "T",
    fromRot: 0,
    toRot: 1,
    spin: "cw",
    baseX: 10,
    baseY: 5,
    canPlace: () => false,
  });
  assert.equal(blocked, null);
});
