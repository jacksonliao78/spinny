import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_GAME_CONFIG, getGravityIntervalMs, getLineClearBasePoints } from "../../engine/game/rules";

test("getLineClearBasePoints maps known clear counts and defaults to zero", () => {
  assert.equal(getLineClearBasePoints(1, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.lineClearPoints.single);
  assert.equal(getLineClearBasePoints(2, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.lineClearPoints.double);
  assert.equal(getLineClearBasePoints(3, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.lineClearPoints.triple);
  assert.equal(getLineClearBasePoints(4, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.lineClearPoints.quad);
  assert.equal(getLineClearBasePoints(0, DEFAULT_GAME_CONFIG), 0);
  assert.equal(getLineClearBasePoints(5, DEFAULT_GAME_CONFIG), 0);
});

test("getGravityIntervalMs scales by level and clamps to min interval", () => {
  const atLevelOne = getGravityIntervalMs(1, DEFAULT_GAME_CONFIG);
  const atLevelZero = getGravityIntervalMs(0, DEFAULT_GAME_CONFIG);
  assert.equal(atLevelZero, atLevelOne);

  const atLevelTen = getGravityIntervalMs(10, DEFAULT_GAME_CONFIG);
  assert.ok(atLevelTen <= atLevelOne);

  const clamped = getGravityIntervalMs(999, DEFAULT_GAME_CONFIG);
  assert.equal(clamped, DEFAULT_GAME_CONFIG.minGravityIntervalMs);
});
