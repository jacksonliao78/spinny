import test from "node:test";
import assert from "node:assert/strict";

import { buildMultiplayerResultPayload, isMultiplayerResultPayload } from "../../app/multiplayer/results";

test("isMultiplayerResultPayload accepts valid match results and rejects malformed values", () => {
  const payload = buildMultiplayerResultPayload("room-1", "user-1", "player", 123);

  assert.equal(isMultiplayerResultPayload(payload, "room-1"), true);
  assert.equal(isMultiplayerResultPayload({ ...payload, roomId: "room-2" }, "room-1"), false);
  assert.equal(isMultiplayerResultPayload({ ...payload, loserUserId: "" }, "room-1"), false);
  assert.equal(isMultiplayerResultPayload({ ...payload, loserUsername: "" }, "room-1"), false);
  assert.equal(isMultiplayerResultPayload({ ...payload, sentAt: Number.NaN }, "room-1"), false);
});
