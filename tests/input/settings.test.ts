import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INPUT_SETTINGS,
  clampInputSettings,
  parseInputSettingsJson,
  sdfFromSliderValue,
  serializeInputSettings,
} from "../../input/settings";

test("clampInputSettings enforces numeric and sdf ranges", () => {
  const s = clampInputSettings({
    dasMs: 10,
    arrMs: 500,
    dcdMs: 400,
    sdf: { kind: "multiplier", value: 99 },
  });
  assert.equal(s.dasMs, 50);
  assert.equal(s.arrMs, 100);
  assert.equal(s.dcdMs, 120);
  assert.deepEqual(s.sdf, { kind: "multiplier", value: 20 });
});

test("parseInputSettingsJson reads v1 storage rows", () => {
  const parsed = parseInputSettingsJson(
    JSON.stringify({ v: 1, dasMs: 160, arrMs: 40, dcdMs: 10, sdf: "instant" }),
  );
  assert.deepEqual(parsed.sdf, { kind: "instant" });
});

test("serialize round-trip preserves semantics", () => {
  const a = clampInputSettings({
    ...DEFAULT_INPUT_SETTINGS,
    sdf: sdfFromSliderValue(21),
  });
  const b = parseInputSettingsJson(serializeInputSettings(a));
  assert.deepEqual(b, a);
});

test("sdfFromSliderValue maps max slider step to instant", () => {
  assert.deepEqual(sdfFromSliderValue(21), { kind: "instant" });
  assert.deepEqual(sdfFromSliderValue(20), { kind: "multiplier", value: 20 });
});
