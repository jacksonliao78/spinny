import test from "node:test";
import assert from "node:assert/strict";

import { buildRoomSettings, createJoinCode, normalizeJoinCode } from "../../app/multiplayer/rooms";

test("normalizeJoinCode uppercases and strips separators", () => {
  assert.equal(normalizeJoinCode(" ab-c 12 "), "ABC12");
});

test("createJoinCode creates compact uppercase room codes", () => {
  const code = createJoinCode(() => 0);

  assert.equal(code.length, 6);
  assert.match(code, /^[A-Z2-9]+$/);
});

test("buildRoomSettings keeps defaults and accepts board overrides", () => {
  assert.deepEqual(buildRoomSettings(), { boardKind: "rectangular" });
  assert.deepEqual(buildRoomSettings({ boardKind: "ring" }), { boardKind: "ring" });
});
