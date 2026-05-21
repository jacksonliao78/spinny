import { createBoard } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import type { GameConfigOverrides } from "@game/game/rules";
import { createSeededRandom } from "@game/random";
import type { InputController } from "../../input/controller";
import type { HudUpdater } from "../../render/hudPanels";
import type { createRenderer } from "../../render/renderer";
import { MODE_LABELS, RECTANGULAR_BOARD_CONFIG, SPRINT_TARGET_CLEARS } from "../constants";
import type { AppScreen } from "../constants";
import { createBotController, getBotDefinition } from "../localBots/bot";
import { getEnabledBotSlots, type LocalBotSlotConfig } from "../localBots/config";
import {
  createLocalFfaMatch,
  routeGarbageAttackEvents,
  updateLocalFfaMatchState,
  type LocalFfaCombatant,
  type LocalFfaMatch,
} from "../localBots/match";
import { getAliveBotCombatants, getVisibleBotCombatant } from "../localBots/view";

type Renderer = ReturnType<typeof createRenderer>;

type LocalBotsPlayingScreenOptions = {
  humanCanvas: HTMLCanvasElement;
  backButton: HTMLButtonElement;
  title: HTMLElement;
  botStation: HTMLElement;
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
  getBotSlots: () => LocalBotSlotConfig[];
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
  const placement = combatant.placement ? `#${combatant.placement} / ` : "";
  const detail = combatant.detail ? `${combatant.detail} / ` : "";
  return `${combatant.name}: ${placement}${detail}${summary.linesClearedTotal} lines / ${summary.score} score / ${summary.stats.locksPlaced} pieces / ${summary.metrics.speed.piecesPerSecond.toFixed(2)} PPS`;
};

const initLocalBotsPlayingScreen = ({
  humanCanvas,
  backButton,
  title,
  botStation,
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
  getBotSlots,
}: LocalBotsPlayingScreenOptions): LocalBotsPlayingScreen => {
  let match: LocalFfaMatch | null = null;
  let human: LocalFfaCombatant | null = null;
  let initialBotCount = 1;
  let renderedBotId: string | null = null;
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

  const getTargetName = (targetId: string | null): string => {
    if (!match || !targetId) return "-";
    return match.combatants.find((combatant) => combatant.id === targetId)?.name ?? "-";
  };

  const updateVisibleBot = (): LocalFfaCombatant | null => {
    if (!match) return null;
    const visibleBot = getVisibleBotCombatant(match, initialBotCount);
    botStation.hidden = visibleBot === null;
    if (visibleBot && visibleBot.id !== renderedBotId) {
      renderedBotId = visibleBot.id;
      botRenderer.reset(visibleBot.game.board.rotation);
      botRenderer.syncGameConfig(visibleBot.game);
      botHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    } else if (!visibleBot) {
      renderedBotId = null;
    }
    return visibleBot;
  };

  const updateStatus = (): void => {
    if (!match || !human) return;
    const visibleBot = updateVisibleBot();
    const aliveBots = getAliveBotCombatants(match);
    humanStatus.textContent = human.alive ? human.name : `${human.name} out`;
    humanTarget.textContent = initialBotCount > 1 && aliveBots.length > 1 ? `${aliveBots.length} bots` : getTargetName(human.targetId);
    setGarbageMeter(humanGarbageMeter, humanGarbageValue, human.game.getSnapshot().incomingGarbage);
    if (visibleBot) {
      botStatus.textContent = visibleBot.alive ? visibleBot.name : `${visibleBot.name} out`;
      botTarget.textContent = getTargetName(visibleBot.targetId);
      setGarbageMeter(botGarbageMeter, botGarbageValue, visibleBot.game.getSnapshot().incomingGarbage);
    }
  };

  const startMatch = (): void => {
    const seed = `local-bots:${Date.now()}`;
    const slots = getEnabledBotSlots(getBotSlots());
    if (slots.length === 0) return;
    const humanGame = createLocalGame(`${seed}:human`);
    const botInputs = slots.map((slot) => {
      const definition = getBotDefinition(slot.botKind);
      const botGame = createLocalGame(`${seed}:${slot.id}`);
      return {
        id: slot.id,
        name: slot.label,
        detail: definition.label,
        targetPps: slot.targetPps,
        kind: "bot" as const,
        game: botGame,
        controller: createBotController({
          targetPps: slot.targetPps,
          brain: definition.createBrain(),
        }),
      };
    });
    match = createLocalFfaMatch(
      [
        { id: "human", name: "You", kind: "human", game: humanGame },
        ...botInputs,
      ],
      createSeededRandom(`${seed}:targets`),
    );
    human = match.combatants[0];
    initialBotCount = botInputs.length;
    renderedBotId = null;
    durationMs = 0;
    resultShown = false;
    resultEl.hidden = true;
    setHumanGame(humanGame);
    humanController.setEnabled(true);
    setGameplayBlocked(false);
    humanRenderer.reset(humanGame.board.rotation);
    humanRenderer.syncGameConfig(humanGame);
    humanHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    botHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    updateVisibleBot();
    title.textContent = `Bots / ${botInputs.length + 1}P ${MODE_LABELS.versus}`;
    navigate("bots-playing");
    resetLastFrameTime();
    humanCanvas.focus();
    updateStatus();
    syncInputControllerState();
  };

  backButton.addEventListener("click", () => {
    match = null;
    human = null;
    setHumanGame(null);
    resultEl.hidden = true;
    botStation.hidden = false;
    setGameplayBlocked(false);
    navigate("bots-setup");
  });
  rematchButton.addEventListener("click", startMatch);
  setupButton.addEventListener("click", () => {
    match = null;
    setHumanGame(null);
    resultEl.hidden = true;
    botStation.hidden = false;
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
    if (getAppScreen() !== "bots-playing" || !match || !human) return;
    const visibleBot = updateVisibleBot();
    humanController.update(dtMs, human.game.getSnapshot().gravityIntervalMs);
    humanRenderer.updateRotation(human.game.board.rotation, dtMs);
    humanRenderer.draw(human.game, false);
    humanHud.update(human.game.getSnapshot());
    if (visibleBot) {
      botRenderer.updateRotation(visibleBot.game.board.rotation, dtMs);
      botRenderer.draw(visibleBot.game, false);
      botHud.update(visibleBot.game.getSnapshot());
    }
  };

  const onResize = (): void => {
    if (!match || !human) return;
    const visibleBot = getVisibleBotCombatant(match, initialBotCount);
    humanRenderer.syncGameConfig(human.game);
    if (visibleBot) botRenderer.syncGameConfig(visibleBot.game);
  };

  return { startMatch, stepFrame, drawFrame, onResize };
};

export { initLocalBotsPlayingScreen };
export type { LocalBotsPlayingScreen };
