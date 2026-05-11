import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GAME_CONFIG,
  GAME_MODE_POLICIES,
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

test("resolveGameConfig preserves survival overrides under garbage", () => {
  const resolved = resolveGameConfig({
    garbage: {
      enabled: true,
      survival: {
        tierDurationMs: 30_000,
        intervalsMs: [4000, 2000],
        linesPerEvent: 1,
      },
    },
  });

  assert.ok(resolved.garbage.survival);
  assert.equal(resolved.garbage.survival!.tierDurationMs, 30_000);
  assert.deepEqual(resolved.garbage.survival!.intervalsMs, [4000, 2000]);
  assert.equal(resolved.garbage.survival!.linesPerEvent, 1);
});

test("resolveGameConfig defaults survival to undefined when not provided", () => {
  const resolved = resolveGameConfig({ garbage: { enabled: true } });
  assert.equal(resolved.garbage.survival, undefined);
});

test("resolveGameConfig applies marathon survival defaults", () => {
  const resolved = resolveGameConfig({ mode: { kind: "marathon" } });

  assert.equal(resolved.garbage.enabled, true);
  assert.equal(resolved.garbage.holesPerRing, 1);
  assert.equal(resolved.garbage.maxPerApply, 10);
  assert.ok(resolved.garbage.survival);
  assert.equal(resolved.garbage.survival!.tierDurationMs, 60_000);
  assert.deepEqual(resolved.garbage.survival!.intervalsMs, [6_000, 5_000, 4_000, 3_000, 2_000, 1_000]);
  assert.equal(resolved.garbage.survival!.linesPerEvent, 1);
});

test("resolveGameConfig lets explicit garbage survival overrides disable marathon survival", () => {
  const resolved = resolveGameConfig({
    mode: { kind: "marathon" },
    garbage: { enabled: false, survival: null },
  });

  assert.equal(resolved.garbage.enabled, false);
  assert.equal(resolved.garbage.survival, undefined);
});

test("mode policies mark saved modes and Zen practice behavior", () => {
  assert.equal(GAME_MODE_POLICIES.timed.savesRun, true);
  assert.equal(GAME_MODE_POLICIES.marathon.savesRun, true);
  assert.equal(GAME_MODE_POLICIES.sprint.savesRun, true);
  assert.equal(GAME_MODE_POLICIES.zen.savesRun, false);
  assert.equal(GAME_MODE_POLICIES.versus.savesRun, false);
  assert.equal(GAME_MODE_POLICIES.zen.timerStyle, "none");
  assert.equal(GAME_MODE_POLICIES.zen.advancesLevel, false);
});

test("resolveGameConfig applies versus garbage defaults without survival", () => {
  const resolved = resolveGameConfig({ mode: { kind: "versus" } });

  assert.equal(resolved.mode.kind, "versus");
  assert.equal(resolved.garbage.enabled, true);
  assert.equal(resolved.garbage.holesPerRing, 1);
  assert.equal(resolved.garbage.maxPerApply, 8);
  assert.equal(resolved.garbage.groupSize, 4);
  assert.equal(resolved.garbage.survival, undefined);
  assert.equal(GAME_MODE_POLICIES.versus.timerStyle, "countup");
  assert.equal(GAME_MODE_POLICIES.versus.advancesLevel, false);
});
