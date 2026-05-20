import { createBoard } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import type { GameConfigOverrides } from "@game/game/rules";
import { createSeededRandom } from "@game/random";
import type { InputController } from "../../input/controller";
import type { HudUpdater } from "../../render/hudPanels";
import type { createRenderer } from "../../render/renderer";
import { MODE_LABELS, RECTANGULAR_BOARD_CONFIG, SPRINT_TARGET_CLEARS } from "../constants";
import type { AppScreen } from "../constants";
import { createBotController } from "../localBots/bot";
import {
  createLocalFfaMatch,
  routeGarbageAttackEvents,
  updateLocalFfaMatchState,
  type LocalFfaCombatant,
  type LocalFfaMatch,
} from "../localBots/match";

type Renderer = ReturnType<typeof createRenderer>;

type LocalBotsPlayingScreenOptions = {
  humanCanvas: HTMLCanvasElement;
  backButton: HTMLButtonElement;
  title: HTMLElement;
  humanRenderer: Renderer;
  botRenderer: Renderer;
  humanHud: HudUpdater;
  botHud: HudUpdater;
  humanController: InputController;
  humanStatus: HTMLElement;
  botStatus: HTMLElement;
  humanTarget: HTMLElement;
  botTarget: HTMLElement;
  humanGarbageMeter: HTMLElement;
  humanGarbageValue: HTMLElement;
  botGarbageMeter: HTMLElement;
  botGarbageValue: HTMLElement;
  resultEl: HTMLElement;
  resultHeadline: HTMLElement;
  resultSubhead: HTMLElement;
  resultStats: HTMLElement;
  rematchButton: HTMLButtonElement;
  setupButton: HTMLButtonElement;
  getAppScreen: () => AppScreen;
  navigate: (screen: AppScreen) => void;
  resetLastFrameTime: () => void;
  syncInputControllerState: () => void;
  setGameplayBlocked: (blocked: boolean) => void;
  setHumanGame: (game: Game | null) => void;
  getBotTargetPps: () => number;
};

type LocalBotsPlayingScreen = {
  startMatch: () => void;
  stepFrame: (dtMs: number) => void;
  drawFrame: (dtMs: number) => void;
  onResize: () => void;
};

const makeGameConfig = (): GameConfigOverrides => ({
  board: RECTANGULAR_BOARD_CONFIG,
  mode: {
    kind: "versus",
    sprintTargetClears: SPRINT_TARGET_CLEARS.rectangular,
  },
});

const createLocalGame = (seed: string): Game => {
  const random = createSeededRandom(seed);
  return new Game({
    random,
    boardFactory: (width, height, boardRandom) => createBoard("rectangular", width, height, boardRandom),
    config: makeGameConfig(),
  });
};

const setGarbageMeter = (meter: HTMLElement, valueEl: HTMLElement, amount: number): void => {
  const safeAmount = Math.max(0, Math.floor(amount));
  const level = Math.min(5, Math.ceil(safeAmount / 4));
  meter.dataset.level = String(level);
  valueEl.textContent = safeAmount > 20 ? "20+" : String(safeAmount);
};

const formatSummaryLine = (combatant: LocalFfaCombatant, durationMs: number): string => {
  const summary: RunSummary = combatant.finalSummary ?? combatant.game.getRunSummary(durationMs);
  return `${combatant.name}: ${summary.linesClearedTotal} lines / ${summary.score} score / ${summary.stats.locksPlaced} pieces / ${summary.metrics.speed.piecesPerSecond.toFixed(2)} PPS`;
};

const initLocalBotsPlayingScreen = ({
  humanCanvas,
  backButton,
  title,
  humanRenderer,
  botRenderer,
  humanHud,
  botHud,
  humanController,
  humanStatus,
  botStatus,
  humanTarget,
  botTarget,
  humanGarbageMeter,
  humanGarbageValue,
  botGarbageMeter,
  botGarbageValue,
  resultEl,
  resultHeadline,
  resultSubhead,
  resultStats,
  rematchButton,
  setupButton,
  getAppScreen,
  navigate,
  resetLastFrameTime,
  syncInputControllerState,
  setGameplayBlocked,
  setHumanGame,
  getBotTargetPps,
}: LocalBotsPlayingScreenOptions): LocalBotsPlayingScreen => {
  let match: LocalFfaMatch | null = null;
  let human: LocalFfaCombatant | null = null;
  let bot: LocalFfaCombatant | null = null;
  let durationMs = 0;
  let resultShown = false;

  const renderResultStats = (): void => {
    if (!match) return;
    resultStats.replaceChildren();
    match.combatants.forEach((combatant) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = combatant.name;
      dd.textContent = formatSummaryLine(combatant, durationMs).replace(`${combatant.name}: `, "");
      resultStats.append(dt, dd);
    });
  };

  const showResult = (): void => {
    if (!match || resultShown) return;
    resultShown = true;
    setGameplayBlocked(true);
    const winner = match.combatants.find((combatant) => combatant.id === match?.winnerId);
    resultHeadline.textContent = winner ? `${winner.name} Won` : "No Winner";
    resultSubhead.textContent = `Local FFA / ${MODE_LABELS.versus}`;
    renderResultStats();
    resultEl.hidden = false;
    resultEl.focus();
    syncInputControllerState();
  };

  const updateStatus = (): void => {
    if (!match || !human || !bot) return;
    humanStatus.textContent = human.alive ? human.name : `${human.name} out`;
    botStatus.textContent = bot.alive ? bot.name : `${bot.name} out`;
    const humanTargetCombatant = match.combatants.find((combatant) => combatant.id === human?.targetId);
    const botTargetCombatant = match.combatants.find((combatant) => combatant.id === bot?.targetId);
    humanTarget.textContent = humanTargetCombatant ? humanTargetCombatant.name : "-";
    botTarget.textContent = botTargetCombatant ? botTargetCombatant.name : "-";
    setGarbageMeter(humanGarbageMeter, humanGarbageValue, human.game.getSnapshot().incomingGarbage);
    setGarbageMeter(botGarbageMeter, botGarbageValue, bot.game.getSnapshot().incomingGarbage);
  };

  const startMatch = (): void => {
    const seed = `local-bots:${Date.now()}`;
    const humanGame = createLocalGame(`${seed}:human`);
    const botGame = createLocalGame(`${seed}:bot`);
    match = createLocalFfaMatch(
      [
        { id: "human", name: "You", kind: "human", game: humanGame },
        {
          id: "bot-1",
          name: "Bot 1",
          kind: "bot",
          game: botGame,
          controller: createBotController({ targetPps: getBotTargetPps() }),
        },
      ],
      createSeededRandom(`${seed}:targets`),
    );
    human = match.combatants[0];
    bot = match.combatants[1];
    durationMs = 0;
    resultShown = false;
    resultEl.hidden = true;
    setHumanGame(humanGame);
    humanController.setEnabled(true);
    setGameplayBlocked(false);
    humanRenderer.reset(humanGame.board.rotation);
    botRenderer.reset(botGame.board.rotation);
    humanRenderer.syncGameConfig(humanGame);
    botRenderer.syncGameConfig(botGame);
    humanHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    botHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    title.textContent = `Bots / ${MODE_LABELS.versus}`;
    navigate("bots-playing");
    resetLastFrameTime();
    humanCanvas.focus();
    updateStatus();
    syncInputControllerState();
  };

  backButton.addEventListener("click", () => {
    match = null;
    human = null;
    bot = null;
    setHumanGame(null);
    resultEl.hidden = true;
    setGameplayBlocked(false);
    navigate("bots-setup");
  });
  rematchButton.addEventListener("click", startMatch);
  setupButton.addEventListener("click", () => {
    match = null;
    setHumanGame(null);
    resultEl.hidden = true;
    setGameplayBlocked(false);
    navigate("bots-setup");
  });

  const stepFrame = (dtMs: number): void => {
    if (getAppScreen() !== "bots-playing" || !match) return;
    if (!match.completed) durationMs += dtMs;
    for (const combatant of match.combatants) {
      if (!combatant.alive) continue;
      combatant.controller?.update(combatant.game, dtMs);
      combatant.game.tick(dtMs);
      const attacks = combatant.game.consumeGarbageAttackEvents();
      routeGarbageAttackEvents(match, combatant.id, attacks);
    }
    updateLocalFfaMatchState(match, durationMs);
    updateStatus();
    if (match.completed) showResult();
  };

  const drawFrame = (dtMs: number): void => {
    if (getAppScreen() !== "bots-playing" || !human || !bot) return;
    humanController.update(dtMs, human.game.getSnapshot().gravityIntervalMs);
    humanRenderer.updateRotation(human.game.board.rotation, dtMs);
    botRenderer.updateRotation(bot.game.board.rotation, dtMs);
    humanRenderer.draw(human.game, false);
    botRenderer.draw(bot.game, false);
    humanHud.update(human.game.getSnapshot());
    botHud.update(bot.game.getSnapshot());
  };

  const onResize = (): void => {
    if (!human || !bot) return;
    humanRenderer.syncGameConfig(human.game);
    botRenderer.syncGameConfig(bot.game);
  };

  return { startMatch, stepFrame, drawFrame, onResize };
};

export { initLocalBotsPlayingScreen };
export type { LocalBotsPlayingScreen };
