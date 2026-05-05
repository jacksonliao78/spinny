import test from "node:test";
import assert from "node:assert/strict";

import { get180Kicks, getKicks, normalizeRotation, try180Kicks, tryKicks } from "../../engine/srs";

test("normalizeRotation wraps negative and large values", () => {
  assert.equal(normalizeRotation(-1), 3);
  assert.equal(normalizeRotation(8), 0);
  assert.equal(normalizeRotation(11), 3);
});

test("getKicks returns expected defaults for O and I pieces (SRS+ I quarter-turns)", () => {
  assert.deepEqual(getKicks("O", 0, 1, "cw"), [[0, 0]]);

  const iKicks = getKicks("I", 0, 1, "cw");
  assert.equal(iKicks.length, 5);
  assert.deepEqual(iKicks[0], [0, 0]);
  assert.deepEqual(iKicks[1], [-2, 0]);
  assert.deepEqual(iKicks[3], [1, 2]);
});

test("get180Kicks returns six tests for JLSTZ and I", () => {
  assert.deepEqual(get180Kicks("T", 0, 2)[0], [0, -1]);
  assert.equal(get180Kicks("T", 0, 2).length, 6);
  assert.deepEqual(get180Kicks("O", 0, 2), [[0, 0]]);
});

test("try180Kicks picks first valid 180 offset", () => {
  const placed = try180Kicks({
    pieceType: "L",
    fromRot: 0,
    toRot: 2,
    baseX: 4,
    baseY: 10,
    canPlace: (rot, x, y) => rot === 2 && x === 4 && y === 9,
  });
  assert.deepEqual(placed?.usedKick, [0, -1]);
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
