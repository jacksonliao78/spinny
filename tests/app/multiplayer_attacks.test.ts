import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRemoteGarbageAttack,
  buildMultiplayerAttackPayload,
  createAttackDeduper,
  isMultiplayerAttackPayload,
} from "../../app/multiplayer/attacks";

test("isMultiplayerAttackPayload accepts valid attacks and rejects malformed values", () => {
  const payload = buildMultiplayerAttackPayload("room-1", "user-1", 7, 3, 123);

  assert.equal(isMultiplayerAttackPayload(payload, "room-1"), true);
  assert.equal(isMultiplayerAttackPayload({ ...payload, roomId: "room-2" }, "room-1"), false);
  assert.equal(isMultiplayerAttackPayload({ ...payload, amount: 0 }, "room-1"), false);
  assert.equal(isMultiplayerAttackPayload({ ...payload, amount: 1.5 }, "room-1"), false);
  assert.equal(isMultiplayerAttackPayload({ ...payload, attackId: "" }, "room-1"), false);
  assert.equal(isMultiplayerAttackPayload({ ...payload, attackerUserId: "" }, "room-1"), false);
});

test("applyRemoteGarbageAttack dedupes and enqueues valid remote attacks once", () => {
  const deduper = createAttackDeduper();
  const payload = buildMultiplayerAttackPayload("room-1", "opponent", 1, 4, 123);
  const enqueued: number[] = [];

  assert.equal(applyRemoteGarbageAttack(payload, "room-1", "self", deduper, (amount) => enqueued.push(amount)), true);
  assert.equal(applyRemoteGarbageAttack(payload, "room-1", "self", deduper, (amount) => enqueued.push(amount)), false);
  assert.deepEqual(enqueued, [4]);
  assert.equal(applyRemoteGarbageAttack(payload, "room-1", "opponent", deduper, (amount) => enqueued.push(amount)), false);
  assert.deepEqual(enqueued, [4]);
});

test("createAttackDeduper accepts attack ids once until reset", () => {
  const deduper = createAttackDeduper();

  assert.equal(deduper.accept("user-1:1"), true);
  assert.equal(deduper.accept("user-1:1"), false);
  assert.equal(deduper.accept("user-1:2"), true);
  deduper.reset();
  assert.equal(deduper.accept("user-1:1"), true);
});
