import test from "node:test";
import assert from "node:assert/strict";

import { SAVED_RUN_MODES, SPRINT_TARGET_CLEARS } from "../../app/constants";

test("Sprint targets use board-specific clear units", () => {
  assert.equal(SPRINT_TARGET_CLEARS.rectangular, 40);
  assert.equal(SPRINT_TARGET_CLEARS.ring, 10);
});

test("Saved run modes include competitive solo modes and exclude Zen", () => {
  assert.equal(SAVED_RUN_MODES.has("timed"), true);
  assert.equal(SAVED_RUN_MODES.has("marathon"), true);
  assert.equal(SAVED_RUN_MODES.has("sprint"), true);
  assert.equal(SAVED_RUN_MODES.has("zen"), false);
});
