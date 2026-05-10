import test from "node:test";
import assert from "node:assert/strict";

import { Queue } from "../../engine/queue";
import { createSeededRandom } from "../../engine/random";

const ALL_TYPES = new Set(["O", "I", "Z", "S", "L", "J", "T"]);

test("Queue peek and consume keep preview invariants", () => {
  const queue = new Queue(() => 0);
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
});

test("Queue uses seeded randomness deterministically", () => {
  const a = new Queue(createSeededRandom("room-abc"));
  const b = new Queue(createSeededRandom("room-abc"));

  assert.deepEqual(a.peekNext(5), b.peekNext(5));
  assert.deepEqual(
    Array.from({ length: 12 }, () => a.consumeNext(0, 0).type),
    Array.from({ length: 12 }, () => b.consumeNext(0, 0).type),
  );
});
