import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultLocalBotSlots, getEnabledBotSlots } from "../../app/localBots/config";
import { getLocalBotsCombatantLayout, getVisibleBotCombatant } from "../../app/localBots/view";
import type { LocalFfaMatch } from "../../app/localBots/match";

test("default local bot slots enable Bot 1 as Bot B", () => {
  const slots = getDefaultLocalBotSlots();

  assert.equal(slots.length, 3);
  assert.equal(slots[0].enabled, true);
  assert.equal(slots[0].botKind, "bot-b");
  assert.equal(slots[0].targetPps, 1.6);
  assert.equal(slots[1].enabled, false);
  assert.equal(slots[1].botKind, "bot-a");
  assert.equal(slots[2].enabled, false);
});

test("enabled local bot slots ignore disabled slots", () => {
  const slots = getDefaultLocalBotSlots();
  slots[0].enabled = false;
  slots[1].enabled = true;
  slots[1].botKind = "bot-b";

  const enabled = getEnabledBotSlots(slots);

  assert.deepEqual(
    enabled.map((slot) => slot.id),
    ["bot-2"],
  );
  assert.equal(enabled[0].botKind, "bot-b");
});

test("one-bot matches render side-by-side", () => {
  const match = {
    combatants: [
      { id: "human", kind: "human", alive: true },
      { id: "bot-1", kind: "bot", alive: true },
    ],
  } as LocalFfaMatch;

  assert.equal(getVisibleBotCombatant(match)?.id, "bot-1");
});

test("multi-bot matches render player-only while more than two combatants are alive", () => {
  const match = {
    combatants: [
      { id: "human", kind: "human", alive: true },
      { id: "bot-1", kind: "bot", alive: true },
      { id: "bot-2", kind: "bot", alive: true },
      { id: "bot-3", kind: "bot", alive: true },
    ],
  } as LocalFfaMatch;

  let layout = getLocalBotsCombatantLayout(match);
  assert.equal(layout.mode, "player-only");
  assert.equal(layout.primary.id, "human");
  assert.equal(layout.opponent, null);
  assert.equal(layout.aliveCount, 4);

  match.combatants[1].alive = false;
  layout = getLocalBotsCombatantLayout(match);
  assert.equal(layout.mode, "player-only");
  assert.equal(layout.primary.id, "human");
  assert.equal(layout.opponent, null);
  assert.equal(layout.aliveCount, 3);
});

test("multi-bot matches render side-by-side when exactly two combatants are alive", () => {
  const match = {
    combatants: [
      { id: "human", kind: "human", alive: true },
      { id: "bot-1", kind: "bot", alive: false },
      { id: "bot-2", kind: "bot", alive: false },
      { id: "bot-3", kind: "bot", alive: true },
    ],
  } as LocalFfaMatch;

  const layout = getLocalBotsCombatantLayout(match);
  assert.equal(layout.mode, "side-by-side");
  assert.equal(layout.primary.id, "human");
  assert.equal(layout.opponent?.id, "bot-3");
  assert.equal(getVisibleBotCombatant(match)?.id, "bot-3");
});

test("final bot duels render both alive bot boards after the player is out", () => {
  const match = {
    combatants: [
      { id: "human", kind: "human", alive: false },
      { id: "bot-1", kind: "bot", alive: true },
      { id: "bot-2", kind: "bot", alive: false },
      { id: "bot-3", kind: "bot", alive: true },
    ],
  } as LocalFfaMatch;

  const layout = getLocalBotsCombatantLayout(match);
  assert.equal(layout.mode, "side-by-side");
  assert.equal(layout.primary.id, "bot-1");
  assert.equal(layout.opponent?.id, "bot-3");
});

test("completed multi-bot matches render only the surviving board", () => {
  const match = {
    combatants: [
      { id: "human", kind: "human", alive: false },
      { id: "bot-1", kind: "bot", alive: false },
      { id: "bot-2", kind: "bot", alive: true },
      { id: "bot-3", kind: "bot", alive: false },
    ],
  } as LocalFfaMatch;

  const layout = getLocalBotsCombatantLayout(match);
  assert.equal(layout.mode, "player-only");
  assert.equal(layout.primary.id, "bot-2");
  assert.equal(layout.opponent, null);
  assert.equal(layout.aliveCount, 1);
});
