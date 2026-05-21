import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseRandomTargetId,
  createLocalFfaMatch,
  routeGarbageAttackEvents,
  updateLocalFfaMatchState,
} from "../../app/localBots/match";
import { RECTANGULAR_BOARD_CONFIG } from "../../app/constants";
import { createBoard } from "../../engine/board/factory";
import { Game } from "../../engine/game";
import { createSeededRandom } from "../../engine/random";

const makeGame = (seed: string): Game =>
  new Game({
    random: createSeededRandom(seed),
    boardFactory: (width, height, random) => createBoard("rectangular", width, height, random),
    config: {
      board: RECTANGULAR_BOARD_CONFIG,
      mode: {
        kind: "versus",
      },
    },
  });

const setGameOver = (game: Game): void => {
  game.gameOver = true;
};

test("createLocalFfaMatch assigns targets only to alive opponents", () => {
  const human = makeGame("human");
  const bot = makeGame("bot");
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: bot },
    ],
    () => 0,
  );

  assert.equal(match.combatants[0].targetId, "bot-1");
  assert.equal(match.combatants[1].targetId, "human");
  assert.equal(chooseRandomTargetId(match, "human", () => 0), "bot-1");
});

test("updateLocalFfaMatchState retargets when a target is out and completes at one alive combatant", () => {
  const human = makeGame("human");
  const botOne = makeGame("bot-1");
  const botTwo = makeGame("bot-2");
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: botOne },
      { id: "bot-2", name: "Bot 2", kind: "bot", game: botTwo },
    ],
    () => 0,
  );
  match.combatants[0].targetId = "bot-1";

  setGameOver(botOne);
  updateLocalFfaMatchState(match, 1000, () => 0);

  assert.equal(match.combatants[0].targetId, "bot-2");
  assert.equal(match.completed, false);

  setGameOver(botTwo);
  updateLocalFfaMatchState(match, 2000, () => 0);

  assert.equal(match.completed, true);
  assert.equal(match.winnerId, "human");
});

test("routeGarbageAttackEvents sends attacks only to the current target", () => {
  const human = makeGame("human");
  const bot = makeGame("bot");
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: bot },
    ],
    () => 0,
  );

  assert.equal(routeGarbageAttackEvents(match, "human", [{ id: 1, amount: 2 }, { id: 2, amount: 3 }]), 5);
  assert.equal(bot.getSnapshot().incomingGarbage, 5);
  assert.equal(human.getSnapshot().incomingGarbage, 0);
});

test("updateLocalFfaMatchState gives simultaneous eliminations the same placement", () => {
  const human = makeGame("human");
  const bot = makeGame("bot");
  const match = createLocalFfaMatch(
    [
      { id: "human", name: "You", kind: "human", game: human },
      { id: "bot-1", name: "Bot 1", kind: "bot", game: bot },
    ],
    () => 0,
  );

  setGameOver(human);
  setGameOver(bot);
  updateLocalFfaMatchState(match, 1000, () => 0);

  assert.equal(match.completed, true);
  assert.equal(match.winnerId, null);
  assert.equal(match.combatants[0].placement, 1);
  assert.equal(match.combatants[1].placement, 1);
});
