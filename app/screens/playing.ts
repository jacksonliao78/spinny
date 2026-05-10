import { createBoard } from "@game/board/factory";
import type { BoardKind } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import { GAME_MODE_POLICIES } from "@game/game/rules";
import type { GameConfigOverrides, GameMode } from "@game/game/rules";
import { createSeededRandom } from "@game/random";
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
import type { MultiplayerRoom } from "../multiplayer/rooms";

type Renderer = ReturnType<typeof createRenderer>;

type PlayingScreenOptions = {
  canvas: HTMLCanvasElement;
  backToSetupButton: HTMLButtonElement;
  tipsButton: HTMLButtonElement;
  tipsPopover: HTMLElement;
  gameActions: HTMLElement;
  gameTitle: HTMLElement;
  multiplayerOpponentPanel: HTMLElement;
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
  leaveMultiplayerRoom: () => Promise<void>;
};

type PlayingScreen = {
  startGame: (countdownSeconds?: number) => void;
  startMultiplayerGame: (room: MultiplayerRoom, serverNowMs?: number) => void;
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
  multiplayerOpponentPanel,
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
  leaveMultiplayerRoom,
}: PlayingScreenOptions): PlayingScreen => {
  let runDurationMs = 0;
  let completedRunSaveStarted = false;
  let countdownRemainingMs = 0;
  let countdownEndsAtMs: number | null = null;
  let activeMode: GameMode = getSelectedMode();
  let activeBoard: BoardKind = getSelectedBoard();
  let activeOrigin: "solo" | "multiplayer" = "solo";
  let activeSeed: string | null = null;
  const gamePlayArea = canvas.closest(".game-play-area");

  const syncCountdownRemaining = (): void => {
    if (countdownEndsAtMs === null) return;
    countdownRemainingMs = Math.max(0, countdownEndsAtMs - performance.now());
    if (countdownRemainingMs <= 0) countdownEndsAtMs = null;
  };

  const countdownActive = (): boolean => {
    syncCountdownRemaining();
    return countdownRemainingMs > 0;
  };

  const countdownPending = (): boolean => countdownRemainingMs > 0 || countdownEndsAtMs !== null;

  const renderCountdown = (): void => {
    if (!countdownActive()) {
      countdownEl.hidden = true;
      countdownEl.textContent = "";
      return;
    }
    countdownEl.hidden = false;
    countdownEl.textContent = String(Math.max(1, Math.ceil(countdownRemainingMs / 1000)));
  };

  const beginCountdownMs = (durationMs: number): void => {
    countdownRemainingMs = Math.max(0, durationMs);
    countdownEndsAtMs = countdownRemainingMs > 0 ? performance.now() + countdownRemainingMs : null;
    setGameplayBlocked(countdownActive());
    setPaused(false);
    renderCountdown();
    syncInputControllerState();
  };

  const clearCountdown = (): void => {
    countdownRemainingMs = 0;
    countdownEndsAtMs = null;
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

  const makeGameConfig = (mode: GameMode, boardKind: BoardKind): GameConfigOverrides => {
    const base: GameConfigOverrides = {
      ...(boardKind === "rectangular" ? { board: RECTANGULAR_BOARD_CONFIG } : {}),
      mode: {
        kind: mode,
        sprintTargetClears: SPRINT_TARGET_CLEARS[boardKind],
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

    const board = activeBoard;
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

  const startConfiguredGame = ({
    mode,
    boardKind,
    origin,
    seed,
    countdownMs,
  }: {
    mode: GameMode;
    boardKind: BoardKind;
    origin: "solo" | "multiplayer";
    seed: string | null;
    countdownMs: number;
  }): void => {
    activeMode = mode;
    activeBoard = boardKind;
    activeOrigin = origin;
    activeSeed = seed;
    const random = seed ? createSeededRandom(seed) : undefined;
    const game = new Game({
      boardFactory: (width, height, boardRandom) => createBoard(boardKind, width, height, boardRandom),
      config: makeGameConfig(mode, boardKind),
      random,
      deferFirstSpawn: true,
    });
    setGame(game);
    runDurationMs = 0;
    completedRunSaveStarted = false;
    hideRunSummary();
    gameTitle.textContent = `${origin === "multiplayer" ? "Multiplayer" : "Solo"} / ${MODE_LABELS[mode]}`;
    backToSetupButton.textContent = origin === "multiplayer" ? "Back To Rooms" : "Back To Setup";
    runSummarySetupButton.textContent = origin === "multiplayer" ? "Back To Rooms" : "Back To Menu";
    multiplayerOpponentPanel.hidden = origin !== "multiplayer";
    hudUpdater.configure(mode, SPRINT_TARGET_CLEARS[boardKind]);
    navigate("playing");
    renderer.syncGameConfig(game);
    updateSidebarAlignment(game);
    requestAnimationFrame(() => {
      renderer.syncGameConfig(game);
      updateSidebarAlignment(game);
    });
    renderer.reset(game.getSnapshot().boardRotation);
    beginCountdownMs(countdownMs);
    if (!countdownActive()) {
      game.beginRun();
      setGameplayBlocked(false);
      syncInputControllerState();
    }
    resetLastFrameTime();
    canvas.focus();
  };

  const startGame = (countdownSeconds = 3): void => {
    startConfiguredGame({
      mode: getSelectedMode(),
      boardKind: getSelectedBoard(),
      origin: "solo",
      seed: null,
      countdownMs: countdownSeconds * 1000,
    });
  };

  const startMultiplayerGame = (room: MultiplayerRoom, serverNowMs?: number): void => {
    const startsAtMs = Date.parse(room.countdownStartsAt ?? "");
    startConfiguredGame({
      mode: "versus",
      boardKind: room.settings.boardKind,
      origin: "multiplayer",
      seed: room.seed ?? room.id,
      countdownMs: Number.isFinite(startsAtMs) ? Math.max(0, startsAtMs - (serverNowMs ?? Date.now())) : 0,
    });
  };

  const resetGame = (): void => {
    if (activeOrigin === "multiplayer") {
      startConfiguredGame({
        mode: "versus",
        boardKind: activeBoard,
        origin: "multiplayer",
        seed: activeSeed,
        countdownMs: 2000,
      });
      return;
    }
    startGame(2);
  };

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
    if (e.code === "Escape" && !tipsPopover.hidden) {
      setTipsOpen(false);
      e.preventDefault();
      return true;
    }
    if (getAppScreen() !== "playing") return false;
    if (e.code === "KeyP" && activeMode === "zen") {
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

  const leaveMultiplayerGame = (): void => {
    const leave = async (): Promise<void> => {
      try {
        await leaveMultiplayerRoom();
      } catch (error) {
        console.warn("Could not leave room", error);
        return;
      }
      clearCountdown();
      hideRunSummary();
      navigate("multiplayer");
    };
    void leave();
  };

  canvas.addEventListener("click", () => canvas.focus());
  backToSetupButton.addEventListener("click", () => {
    if (activeOrigin === "multiplayer") {
      leaveMultiplayerGame();
      return;
    }
    clearCountdown();
    hideRunSummary();
    navigate("setup");
  });
  runSummaryRestartButton.addEventListener("click", () => resetGame());
  runSummarySetupButton.addEventListener("click", () => {
    if (activeOrigin === "multiplayer") {
      leaveMultiplayerGame();
      return;
    }
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
    if (getAppScreen() === "playing" && game && countdownPending()) {
      syncCountdownRemaining();
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
      showRunSummary(summary, runDurationMs, activeBoard);
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
    startMultiplayerGame,
    resetGame,
    setTipsOpen,
    stepFrame,
    drawFrame,
    onResize,
  };
};

export { initPlayingScreen };
export type { PlayingScreen };
