import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultLocalBotSlots, getEnabledBotSlots } from "../../app/localBots/config";
import { getVisibleBotCombatant } from "../../app/localBots/view";
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

  assert.equal(getVisibleBotCombatant(match, 1)?.id, "bot-1");
});

test("multi-bot matches render player-only until one bot remains", () => {
  const match = {
    combatants: [
      { id: "human", kind: "human", alive: true },
      { id: "bot-1", kind: "bot", alive: true },
      { id: "bot-2", kind: "bot", alive: true },
      { id: "bot-3", kind: "bot", alive: true },
    ],
  } as LocalFfaMatch;

  assert.equal(getVisibleBotCombatant(match, 3), null);
  match.combatants[1].alive = false;
  match.combatants[2].alive = false;
  assert.equal(getVisibleBotCombatant(match, 3)?.id, "bot-3");
});
