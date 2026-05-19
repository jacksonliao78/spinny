import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseRandomTargetId,
  createLocalFfaMatch,
  routeGarbageAttackEvents,
  updateLocalFfaMatchState,
} from "../../app/localBots/match";

const makeGame = () => {
  let gameOver = false;
  let queued = 0;
  return {
    getSnapshot: () => ({ gameOver }),
    getRunSummary: () => ({}) as any,
    consumeGarbageAttackEvents: () => [],
    enqueueGarbage: (amount: number) => {
      queued += amount;
    },
    setGameOver: () => {
      gameOver = true;
    },
    queued: () => queued,
  };
};

test("createLocalFfaMatch assigns targets only to alive opponents", () => {
  const human = makeGame();
  const bot = makeGame();
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human as any },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: bot as any },
    ],
    () => 0,
  );

  assert.equal(match.combatants[0].targetId, "bot-1");
  assert.equal(match.combatants[1].targetId, "human");
  assert.equal(chooseRandomTargetId(match, "human", () => 0), "bot-1");
});

test("updateLocalFfaMatchState retargets when a target is out and completes at one alive combatant", () => {
  const human = makeGame();
  const botOne = makeGame();
  const botTwo = makeGame();
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human as any },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: botOne as any },
      { id: "bot-2", name: "Bot 2", kind: "bot", game: botTwo as any },
    ],
    () => 0,
  );
  match.combatants[0].targetId = "bot-1";

  botOne.setGameOver();
  updateLocalFfaMatchState(match, 1000, () => 0);

  assert.equal(match.combatants[0].targetId, "bot-2");
  assert.equal(match.completed, false);

  botTwo.setGameOver();
  updateLocalFfaMatchState(match, 2000, () => 0);

  assert.equal(match.completed, true);
  assert.equal(match.winnerId, "human");
});

test("routeGarbageAttackEvents sends attacks only to the current target", () => {
  const human = makeGame();
  const bot = makeGame();
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human as any },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: bot as any },
    ],
    () => 0,
  );

  assert.equal(routeGarbageAttackEvents(match, "human", [{ id: 1, amount: 2 }, { id: 2, amount: 3 }]), 5);
  assert.equal(bot.queued(), 5);
  assert.equal(human.queued(), 0);
});

test("updateLocalFfaMatchState gives simultaneous eliminations the same placement", () => {
  const human = makeGame();
  const bot = makeGame();
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human as any },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: bot as any },
    ],
    () => 0,
  );

  human.setGameOver();
  bot.setGameOver();
  updateLocalFfaMatchState(match, 1000, () => 0);

  assert.equal(match.completed, true);
  assert.equal(match.winnerId, null);
  assert.equal(match.combatants[0].placement, 1);
  assert.equal(match.combatants[1].placement, 1);
});
