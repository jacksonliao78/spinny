import test from "node:test";
import assert from "node:assert/strict";

import { Queue } from "../../engine/queue";

const ALL_TYPES = new Set(["O", "I", "Z", "S", "L", "J", "T"]);

test("Queue peek and consume keep preview invariants", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const queue = new Queue();
    const initialPreview = queue.peekNext(5);
    assert.equal(initialPreview.length, 5);
    assert.ok(initialPreview.every((t) => ALL_TYPES.has(t)));

    const consumed = queue.consumeNext(6, 3);
    const nextPreview = queue.peekNext(5);

    assert.equal(consumed.type, initialPreview[0]);
    assert.equal(consumed.x, 6);
    assert.equal(consumed.y, 3);
    assert.equal(nextPreview.length, 5);
    assert.deepEqual(nextPreview.slice(0, 4), initialPreview.slice(1));
  } finally {
    Math.random = originalRandom;
  }
});
