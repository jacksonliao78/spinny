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
import { getLocalBotsCombatantLayout, type LocalBotsCombatantLayout } from "../localBots/view";
import { renderDefinitionStats, setGarbageMeter } from "./matchPresentation";

type Renderer = ReturnType<typeof createRenderer>;

type LocalBotsPlayingScreenOptions = {
  humanCanvas: HTMLCanvasElement;
  backButton: HTMLButtonElement;
  title: HTMLElement;
  playArea: HTMLElement;
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
  playArea,
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
  let renderedPrimaryId: string | null = null;
  let renderedBotId: string | null = null;
  let renderedLayoutMode: LocalBotsCombatantLayout["mode"] | null = null;
  let durationMs = 0;
  let resultShown = false;

  const renderResultStats = (): void => {
    if (!match) return;
    renderDefinitionStats(
      resultStats,
      match.combatants.map((combatant) => ({
        label: combatant.name,
        value: formatSummaryLine(combatant, durationMs).replace(`${combatant.name}: `, ""),
      })),
    );
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

  const syncRendererForCombatant = (renderer: Renderer, combatant: LocalFfaCombatant): void => {
    renderer.reset(combatant.game.board.rotation);
    renderer.syncGameConfig(combatant.game);
  };

  const clearBotPresentation = (): void => {
    renderedBotId = null;
    botRenderer.reset();
    botRenderer.clear();
    botHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    botStatus.textContent = "";
    botTarget.textContent = "-";
    setGarbageMeter(botGarbageMeter, botGarbageValue, 0);
  };

  const resetMatchPresentation = (): void => {
    renderedPrimaryId = null;
    renderedBotId = null;
    renderedLayoutMode = null;
    humanRenderer.reset();
    botRenderer.reset();
    humanRenderer.clear();
    botRenderer.clear();
    humanHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    botHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    humanStatus.textContent = "You";
    botStatus.textContent = "";
    humanTarget.textContent = "-";
    botTarget.textContent = "-";
    setGarbageMeter(humanGarbageMeter, humanGarbageValue, 0);
    setGarbageMeter(botGarbageMeter, botGarbageValue, 0);
  };

  const leaveMatchPresentation = (): void => {
    match = null;
    human = null;
    durationMs = 0;
    resultShown = false;
    setHumanGame(null);
    resultEl.hidden = true;
    botStation.hidden = true;
    playArea.dataset.layout = "player-only";
    resetMatchPresentation();
    setGameplayBlocked(false);
  };

  const updateLayout = (): LocalBotsCombatantLayout | null => {
    if (!match) return null;
    const layout = getLocalBotsCombatantLayout(match);
    title.textContent = `Bots / ${layout.aliveCount}/${layout.totalCount} alive`;
    const sideBySide = layout.mode === "side-by-side" && layout.opponent !== null;
    playArea.dataset.layout = sideBySide ? "side-by-side" : "player-only";
    botStation.hidden = !sideBySide;

    if (layout.mode !== renderedLayoutMode || layout.primary.id !== renderedPrimaryId) {
      renderedLayoutMode = layout.mode;
      renderedPrimaryId = layout.primary.id;
      syncRendererForCombatant(humanRenderer, layout.primary);
      humanHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    }

    if (layout.opponent && layout.opponent.id !== renderedBotId) {
      renderedBotId = layout.opponent.id;
      syncRendererForCombatant(botRenderer, layout.opponent);
      botHud.configure("versus", SPRINT_TARGET_CLEARS.rectangular);
    } else if (!layout.opponent) {
      if (renderedBotId !== null) clearBotPresentation();
    }

    return layout;
  };

  const updateStatus = (): void => {
    if (!match || !human) return;
    const layout = updateLayout();
    if (!layout) return;
    humanStatus.textContent = layout.primary.alive ? layout.primary.name : `${layout.primary.name} out`;
    humanTarget.textContent =
      layout.mode === "player-only" && layout.aliveCount > 2 ? `${layout.aliveCount} alive` : getTargetName(layout.primary.targetId);
    setGarbageMeter(humanGarbageMeter, humanGarbageValue, layout.primary.game.getSnapshot().incomingGarbage);
    if (layout.opponent) {
      botStatus.textContent = layout.opponent.alive ? layout.opponent.name : `${layout.opponent.name} out`;
      botTarget.textContent = getTargetName(layout.opponent.targetId);
      setGarbageMeter(botGarbageMeter, botGarbageValue, layout.opponent.game.getSnapshot().incomingGarbage);
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
    durationMs = 0;
    resultShown = false;
    resultEl.hidden = true;
    setHumanGame(humanGame);
    humanController.setEnabled(true);
    setGameplayBlocked(false);
    navigate("bots-playing");
    resetMatchPresentation();
    updateLayout();
    resetLastFrameTime();
    humanCanvas.focus();
    updateStatus();
    syncInputControllerState();
  };

  backButton.addEventListener("click", () => {
    leaveMatchPresentation();
    navigate("bots-setup");
  });
  rematchButton.addEventListener("click", startMatch);
  setupButton.addEventListener("click", () => {
    leaveMatchPresentation();
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
    const layout = updateLayout();
    if (!layout) return;
    humanController.update(dtMs, human.game.getSnapshot().gravityIntervalMs);
    humanRenderer.updateRotation(layout.primary.game.board.rotation, dtMs);
    humanRenderer.draw(layout.primary.game, false);
    humanHud.update(layout.primary.game.getSnapshot());
    if (layout.opponent) {
      botRenderer.updateRotation(layout.opponent.game.board.rotation, dtMs);
      botRenderer.draw(layout.opponent.game, false);
      botHud.update(layout.opponent.game.getSnapshot());
    }
  };

  const onResize = (): void => {
    if (!match || !human) return;
    const layout = getLocalBotsCombatantLayout(match);
    humanRenderer.syncGameConfig(layout.primary.game);
    if (layout.opponent) botRenderer.syncGameConfig(layout.opponent.game);
  };

  return { startMatch, stepFrame, drawFrame, onResize };
};

export { initLocalBotsPlayingScreen };
export type { LocalBotsPlayingScreen };
