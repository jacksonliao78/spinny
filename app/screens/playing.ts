import { createBoard } from "@game/board/factory";
import type { BoardKind } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import { GAME_MODE_POLICIES } from "@game/game/rules";
import type { GameConfigOverrides, GameMode } from "@game/game/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InputController } from "../../input/controller";
import type { createRenderer } from "../../render/renderer";
import type { HudUpdater } from "../../render/hudPanels";
import type { AppScreen } from "../constants";
import { MODE_LABELS, RECTANGULAR_BOARD_CONFIG, SPRINT_TARGET_CLEARS } from "../constants";
import { buildCoreRunInsert, buildRunInsert, isMissingRunColumnError } from "../persistence/runs";
import { buildRunSummaryViewModel } from "../runSummary";
import type { SessionController } from "../session";
import { logicalCanvasHeightFromSnap, viewportLogicalYRange } from "../../render/boardCanvasLayout";

type Renderer = ReturnType<typeof createRenderer>;

type PlayingScreenOptions = {
  canvas: HTMLCanvasElement;
  backToSetupButton: HTMLButtonElement;
  tipsButton: HTMLButtonElement;
  tipsPopover: HTMLElement;
  gameActions: HTMLElement;
  gameTitle: HTMLElement;
  countdownEl: HTMLElement;
  runSummaryEl: HTMLElement;
  runSummaryHeadline: HTMLElement;
  runSummarySubhead: HTMLElement;
  runSummaryPrimaryLabel: HTMLElement;
  runSummaryPrimaryValue: HTMLElement;
  runSummaryStats: HTMLElement;
  runSummaryRestartButton: HTMLButtonElement;
  runSummarySetupButton: HTMLButtonElement;
  renderer: Renderer;
  hudUpdater: HudUpdater;
  gameplayController: InputController;
  supabase: SupabaseClient | null;
  session: SessionController;
  getAppScreen: () => AppScreen;
  getSelectedMode: () => GameMode;
  getSelectedBoard: () => BoardKind;
  getGame: () => Game | null;
  setGame: (game: Game | null) => void;
  getPaused: () => boolean;
  setPaused: (paused: boolean) => void;
  navigate: (screen: AppScreen) => void;
  resetLastFrameTime: () => void;
  syncInputControllerState: () => void;
  setGameplayBlocked: (blocked: boolean) => void;
  shouldBlockGameplayKey: () => boolean;
  blockHandledKeys: (e: KeyboardEvent) => void;
};

type PlayingScreen = {
  startGame: (countdownSeconds?: number) => void;
  resetGame: () => void;
  setTipsOpen: (open: boolean) => void;
  stepFrame: (dtMs: number) => void;
  drawFrame: (dtMs: number) => void;
  onResize: () => void;
};

const initPlayingScreen = ({
  canvas,
  backToSetupButton,
  tipsButton,
  tipsPopover,
  gameActions,
  gameTitle,
  countdownEl,
  runSummaryEl,
  runSummaryHeadline,
  runSummarySubhead,
  runSummaryPrimaryLabel,
  runSummaryPrimaryValue,
  runSummaryStats,
  runSummaryRestartButton,
  runSummarySetupButton,
  renderer,
  hudUpdater,
  gameplayController,
  supabase,
  session,
  getAppScreen,
  getSelectedMode,
  getSelectedBoard,
  getGame,
  setGame,
  getPaused,
  setPaused,
  navigate,
  resetLastFrameTime,
  syncInputControllerState,
  setGameplayBlocked,
  shouldBlockGameplayKey,
  blockHandledKeys,
}: PlayingScreenOptions): PlayingScreen => {
  let runDurationMs = 0;
  let completedRunSaveStarted = false;
  let countdownRemainingMs = 0;
  const gamePlayArea = canvas.closest(".game-play-area");

  const countdownActive = (): boolean => countdownRemainingMs > 0;

  const renderCountdown = (): void => {
    if (!countdownActive()) {
      countdownEl.hidden = true;
      countdownEl.textContent = "";
      return;
    }
    countdownEl.hidden = false;
    countdownEl.textContent = String(Math.max(1, Math.ceil(countdownRemainingMs / 1000)));
  };

  const beginCountdown = (seconds: number): void => {
    countdownRemainingMs = Math.max(0, seconds * 1000);
    setGameplayBlocked(countdownActive());
    setPaused(false);
    renderCountdown();
    syncInputControllerState();
  };

  const clearCountdown = (): void => {
    countdownRemainingMs = 0;
    setGameplayBlocked(false);
    renderCountdown();
    syncInputControllerState();
  };

  const hideRunSummary = (): void => {
    runSummaryEl.hidden = true;
    runSummaryStats.replaceChildren();
    setGameplayBlocked(countdownActive());
    syncInputControllerState();
  };

  const showRunSummary = (summary: RunSummary, durationMs: number, boardKind: BoardKind): void => {
    const view = buildRunSummaryViewModel(summary, durationMs, boardKind);
    runSummarySubhead.textContent = view.subhead;
    runSummaryHeadline.textContent = view.headline;
    runSummaryPrimaryLabel.textContent = view.primaryLabel;
    runSummaryPrimaryValue.textContent = view.primaryValue;
    runSummaryStats.replaceChildren(
      ...view.stats.map((stat) => {
        const item = document.createElement("div");
        const label = document.createElement("dt");
        const value = document.createElement("dd");
        label.textContent = stat.label;
        value.textContent = stat.value;
        item.append(label, value);
        return item;
      }),
    );
    runSummaryEl.hidden = false;
    runSummaryEl.focus();
    setGameplayBlocked(true);
    syncInputControllerState();
  };

  const updateSidebarAlignment = (game: Game): void => {
    if (!(gamePlayArea instanceof HTMLElement)) return;
    const snap = game.getSnapshot();
    if (canvas.clientHeight <= 0) return;
    const logicalCanvasHeight = logicalCanvasHeightFromSnap(snap);
    if (logicalCanvasHeight <= 0) return;

    const scale = canvas.clientHeight / logicalCanvasHeight;
    const areaRect = gamePlayArea.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasTopInArea = canvasRect.top - areaRect.top + gamePlayArea.scrollTop;

    const { minY, maxY } = viewportLogicalYRange(snap);

    const viewportTopCss = canvasTopInArea + minY * scale;
    const viewportBottomCss = canvasTopInArea + maxY * scale;

    const topInset = Math.max(0, viewportTopCss);
    const bottomInset = Math.max(0, gamePlayArea.clientHeight - viewportBottomCss);

    gamePlayArea.style.setProperty("--hud-top-inset", `${topInset}px`);
    gamePlayArea.style.setProperty("--hud-bottom-inset", `${bottomInset}px`);
  };

  const setTipsOpen = (open: boolean): void => {
    tipsPopover.hidden = !open;
    tipsButton.setAttribute("aria-expanded", String(open));
  };

  const makeGameConfig = (): GameConfigOverrides => {
    const mode = getSelectedMode();
    const base: GameConfigOverrides = {
      ...(getSelectedBoard() === "rectangular" ? { board: RECTANGULAR_BOARD_CONFIG } : {}),
      mode: {
        kind: mode,
        sprintTargetClears: SPRINT_TARGET_CLEARS[getSelectedBoard()],
      },
    };
    return base;
  };

  const persistCompletedRun = async (summary: RunSummary, durationMs: number): Promise<void> => {
    const currentUser = session.getCurrentUser();
    if (!supabase) {
      return;
    }
    if (!currentUser) {
      return;
    }
    if (session.isGuestMode()) {
      return;
    }
    if (!GAME_MODE_POLICIES[summary.gameMode].savesRun) {
      return;
    }

    const board = getSelectedBoard();
    const finishedAt = new Date();
    const payload = buildRunInsert(currentUser.id, summary, durationMs, board, finishedAt);
    const { error } = await supabase.from("runs").insert(payload);
    if (error && isMissingRunColumnError(error)) {
      const fallbackPayload = buildCoreRunInsert(currentUser.id, summary, durationMs, board, finishedAt);
      const { error: fallbackError } = await supabase.from("runs").insert(fallbackPayload);
      if (!fallbackError) return;
      console.warn("Could not save run", {
        message: fallbackError.message,
        details: (fallbackError as any).details,
        hint: (fallbackError as any).hint,
        code: (fallbackError as any).code,
        payloadKeys: Object.keys(fallbackPayload),
      });
      return;
    }
    if (error) {
      console.warn("Could not save run", {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
        payloadKeys: Object.keys(payload),
      });
    }
  };

  const startGame = (countdownSeconds = 3): void => {
    const selectedBoard = getSelectedBoard();
    const game = new Game({
      boardFactory: (width, height) => createBoard(selectedBoard, width, height),
      config: makeGameConfig(),
      deferFirstSpawn: true,
    });
    setGame(game);
    runDurationMs = 0;
    completedRunSaveStarted = false;
    hideRunSummary();
    gameTitle.textContent = `Solo / ${MODE_LABELS[getSelectedMode()]}`;
    hudUpdater.configure(getSelectedMode(), SPRINT_TARGET_CLEARS[getSelectedBoard()]);
    navigate("playing");
    renderer.syncGameConfig(game);
    updateSidebarAlignment(game);
    requestAnimationFrame(() => {
      renderer.syncGameConfig(game);
      updateSidebarAlignment(game);
    });
    renderer.reset(game.getSnapshot().boardRotation);
    beginCountdown(countdownSeconds);
    resetLastFrameTime();
    canvas.focus();
  };

  const resetGame = (): void => {
    startGame(2);
  };

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
    if (e.code === "Escape" && !tipsPopover.hidden) {
      setTipsOpen(false);
      e.preventDefault();
      return true;
    }
    if (getAppScreen() !== "playing") return false;
    if (e.code === "KeyP" && getSelectedMode() === "zen") {
      if (!countdownActive()) setPaused(!getPaused());
      e.preventDefault();
      return true;
    }
    if (e.code === "KeyR") {
      resetGame();
      e.preventDefault();
      return true;
    }
    return false;
  };

  canvas.addEventListener("click", () => canvas.focus());
  backToSetupButton.addEventListener("click", () => {
    clearCountdown();
    hideRunSummary();
    navigate("setup");
  });
  runSummaryRestartButton.addEventListener("click", () => resetGame());
  runSummarySetupButton.addEventListener("click", () => {
    clearCountdown();
    hideRunSummary();
    navigate("setup");
  });
  tipsButton.addEventListener("click", () => setTipsOpen(!!tipsPopover.hidden));
  document.addEventListener("click", (e) => {
    if (tipsPopover.hidden || gameActions.contains(e.target as Node)) return;
    setTipsOpen(false);
  });

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (handleGlobalKeys(e)) return;
    if (getAppScreen() !== "playing") {
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });
  runSummaryEl.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    handleGlobalKeys(e);
  });

  const stepFrame = (dtMs: number): void => {
    const game = getGame();
    if (getAppScreen() === "playing" && game && countdownActive()) {
      countdownRemainingMs = Math.max(0, countdownRemainingMs - dtMs);
      if (!countdownActive()) {
        game.beginRun();
        setPaused(false);
        setGameplayBlocked(false);
        resetLastFrameTime();
        syncInputControllerState();
      }
      renderCountdown();
      return;
    }
    if (getAppScreen() === "playing" && game && !getPaused()) {
      runDurationMs += dtMs;
      game.tick(dtMs);
      renderer.updateRotation(game.getSnapshot().boardRotation, dtMs);
    }
  };

  const drawFrame = (dtMs: number): void => {
    const game = getGame();
    if (getAppScreen() !== "playing" || !game) return;
    const snap = game.getSnapshot();
    const gravityIntervalMs = snap.gravityIntervalMs;
    gameplayController.update(dtMs, gravityIntervalMs);
    renderer.draw(game, getPaused());
    updateSidebarAlignment(game);
    hudUpdater.update(snap);
    const summary = game.getRunSummary(runDurationMs);
    if (summary.gameOver && !completedRunSaveStarted) {
      completedRunSaveStarted = true;
      showRunSummary(summary, runDurationMs, getSelectedBoard());
      void persistCompletedRun(summary, runDurationMs);
    }
  };

  const onResize = (): void => {
    const game = getGame();
    if (!game) return;
    renderer.syncGameConfig(game);
    updateSidebarAlignment(game);
  };

  syncInputControllerState();

  return {
    startGame,
    resetGame,
    setTipsOpen,
    stepFrame,
    drawFrame,
    onResize,
  };
};

export { initPlayingScreen };
export type { PlayingScreen };
