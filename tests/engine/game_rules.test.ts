import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GAME_CONFIG,
  getComboBonusPoints,
  getGravityIntervalMs,
  getLineClearBasePoints,
  resolveGameConfig,
} from "../../engine/game/rules";

test("getLineClearBasePoints maps known clear counts and defaults to zero", () => {
  assert.equal(getLineClearBasePoints(1, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.scoring.lineClearPoints.single);
  assert.equal(getLineClearBasePoints(2, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.scoring.lineClearPoints.double);
  assert.equal(getLineClearBasePoints(3, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.scoring.lineClearPoints.triple);
  assert.equal(getLineClearBasePoints(4, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.scoring.lineClearPoints.quad);
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
  assert.equal(clamped, DEFAULT_GAME_CONFIG.gravity.minIntervalMs);
});

test("getComboBonusPoints scales with combo count and ignores negative counts", () => {
  assert.equal(getComboBonusPoints(-1, DEFAULT_GAME_CONFIG), 0);
  assert.equal(getComboBonusPoints(0, DEFAULT_GAME_CONFIG), 0);
  assert.equal(getComboBonusPoints(1, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.scoring.comboPointPerChain);
  assert.equal(getComboBonusPoints(3, DEFAULT_GAME_CONFIG), DEFAULT_GAME_CONFIG.scoring.comboPointPerChain * 3);
});

test("resolveGameConfig deeply merges grouped overrides", () => {
  const resolved = resolveGameConfig({
    board: { width: 12 },
    mode: { kind: "zen" },
    scoring: { lineClearPoints: { single: 150 } },
    garbage: { enabled: true },
    modifiers: { allSpins: true },
  });

  assert.equal(resolved.board.width, 12);
  assert.equal(resolved.board.height, DEFAULT_GAME_CONFIG.board.height);
  assert.equal(resolved.mode.kind, "zen");
  assert.equal(resolved.mode.timedDurationMs, DEFAULT_GAME_CONFIG.mode.timedDurationMs);
  assert.equal(resolved.scoring.lineClearPoints.single, 150);
  assert.equal(resolved.scoring.lineClearPoints.double, DEFAULT_GAME_CONFIG.scoring.lineClearPoints.double);
  assert.equal(resolved.garbage.enabled, true);
  assert.equal(resolved.garbage.holesPerRing, DEFAULT_GAME_CONFIG.garbage.holesPerRing);
  assert.equal(resolved.modifiers.allSpins, true);
});
