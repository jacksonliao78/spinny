import test from "node:test";
import assert from "node:assert/strict";

import { getMatchCombatantLayout } from "../../app/matchLayout";

const participant = (id: string, alive = true): { id: string; alive: boolean } => ({ id, alive });

test("match layout shows only the current player while more than two participants are alive", () => {
  const layout = getMatchCombatantLayout(
    [participant("self"), participant("p2"), participant("p3"), participant("p4")],
    "self",
  );

  assert.equal(layout.mode, "player-only");
  assert.equal(layout.primary.id, "self");
  assert.equal(layout.opponent, null);
  assert.equal(layout.aliveCount, 4);
});

test("match layout shows the two remaining participants side-by-side", () => {
  const layout = getMatchCombatantLayout(
    [participant("self"), participant("p2", false), participant("p3")],
    "self",
  );

  assert.equal(layout.mode, "side-by-side");
  assert.equal(layout.primary.id, "self");
  assert.equal(layout.opponent?.id, "p3");
  assert.equal(layout.aliveCount, 2);
});

test("match layout transitions to only the survivor after game over", () => {
  const layout = getMatchCombatantLayout(
    [participant("self", false), participant("p2", false), participant("p3")],
    "self",
  );

  assert.equal(layout.mode, "player-only");
  assert.equal(layout.primary.id, "p3");
  assert.equal(layout.opponent, null);
  assert.equal(layout.aliveCount, 1);
});
