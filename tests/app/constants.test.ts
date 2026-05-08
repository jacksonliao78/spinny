import test from "node:test";
import assert from "node:assert/strict";

import { GAME_MODE_POLICIES } from "../../engine/game/rules";
import { SPRINT_TARGET_CLEARS } from "../../app/constants";

test("Sprint targets use board-specific clear units", () => {
  assert.equal(SPRINT_TARGET_CLEARS.rectangular, 40);
  assert.equal(SPRINT_TARGET_CLEARS.ring, 10);
});

test("Saved run modes include competitive solo modes and exclude Zen", () => {
  assert.equal(GAME_MODE_POLICIES.timed.savesRun, true);
  assert.equal(GAME_MODE_POLICIES.marathon.savesRun, true);
  assert.equal(GAME_MODE_POLICIES.sprint.savesRun, true);
  assert.equal(GAME_MODE_POLICIES.zen.savesRun, false);
});
