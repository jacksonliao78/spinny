import test from "node:test";
import assert from "node:assert/strict";

import { getAttackLines } from "../../engine/game/attack";

test("getAttackLines maps regular clears to baseline garbage", () => {
  assert.equal(getAttackLines({ linesCleared: 0, spin: null, combo: 0, backToBackChain: 0 }), 0);
  assert.equal(getAttackLines({ linesCleared: 1, spin: null, combo: 0, backToBackChain: 0 }), 0);
  assert.equal(getAttackLines({ linesCleared: 2, spin: null, combo: 0, backToBackChain: 0 }), 1);
  assert.equal(getAttackLines({ linesCleared: 3, spin: null, combo: 0, backToBackChain: 0 }), 2);
  assert.equal(getAttackLines({ linesCleared: 4, spin: null, combo: 0, backToBackChain: 0 }), 4);
});

test("getAttackLines rewards T-spin clears", () => {
  const spin = { pieceType: "T" as const, kind: "t-spin" as const };

  assert.equal(getAttackLines({ linesCleared: 0, spin, combo: 0, backToBackChain: 0 }), 0);
  assert.equal(getAttackLines({ linesCleared: 1, spin, combo: 0, backToBackChain: 0 }), 2);
  assert.equal(getAttackLines({ linesCleared: 2, spin, combo: 0, backToBackChain: 0 }), 4);
  assert.equal(getAttackLines({ linesCleared: 3, spin, combo: 0, backToBackChain: 0 }), 6);
});

test("getAttackLines adds combo and back-to-back bonuses after baseline attack", () => {
  const spin = { pieceType: "T" as const, kind: "t-spin" as const };

  assert.equal(getAttackLines({ linesCleared: 1, spin: null, combo: 3, backToBackChain: 0 }), 1);
  assert.equal(getAttackLines({ linesCleared: 2, spin: null, combo: 3, backToBackChain: 0 }), 2);
  assert.equal(getAttackLines({ linesCleared: 4, spin: null, combo: 0, backToBackChain: 2 }), 5);
  assert.equal(getAttackLines({ linesCleared: 2, spin, combo: 4, backToBackChain: 3 }), 6);
});
