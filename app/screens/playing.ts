import { createBoard } from "@game/board/factory";
import type { BoardKind } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import type { GameMode } from "@game/game/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InputController } from "../../input/controller";
import type { createRenderer } from "../../render/renderer";
import type { AppScreen } from "../constants";
import { MODE_LABELS, RECTANGULAR_BOARD_CONFIG, SAVED_RUN_MODES, SPRINT_TARGET_CLEARS } from "../constants";
import { buildRunInsert } from "../persistence/runs";
import type { SessionController } from "../session";

type Renderer = ReturnType<typeof createRenderer>;

type PlayingScreenOptions = {
  canvas: HTMLCanvasElement;
  backToSetupButton: HTMLButtonElement;
  tipsButton: HTMLButtonElement;
  tipsPopover: HTMLElement;
  gameActions: HTMLElement;
  gameTitle: HTMLElement;
  renderer: Renderer;
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
  shouldBlockGameplayKey: () => boolean;
  blockHandledKeys: (e: KeyboardEvent) => void;
};

type PlayingScreen = {
  startGame: () => void;
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
  renderer,
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
  shouldBlockGameplayKey,
  blockHandledKeys,
}: PlayingScreenOptions): PlayingScreen => {
  let runDurationMs = 0;
  let completedRunSaveStarted = false;

  const setTipsOpen = (open: boolean): void => {
    tipsPopover.hidden = !open;
    tipsButton.setAttribute("aria-expanded", String(open));
  };

  const makeGameConfig = () => ({
    ...(getSelectedBoard() === "rectangular" ? { board: RECTANGULAR_BOARD_CONFIG } : {}),
    mode: {
      kind: getSelectedMode(),
      sprintTargetClears: SPRINT_TARGET_CLEARS[getSelectedBoard()],
    },
  });

  const persistCompletedRun = async (summary: RunSummary, durationMs: number): Promise<void> => {
    const currentUser = session.getCurrentUser();
    if (!supabase || !currentUser || session.isGuestMode() || !SAVED_RUN_MODES.has(summary.gameMode)) return;
    const { error } = await supabase.from("runs").insert(buildRunInsert(currentUser.id, summary, durationMs, getSelectedBoard()));
    if (error) console.warn("Could not save run", error);
  };

  const startGame = (): void => {
    const selectedBoard = getSelectedBoard();
    const game = new Game({
      boardFactory: (width, height) => createBoard(selectedBoard, width, height),
      config: makeGameConfig(),
    });
    setGame(game);
    setPaused(false);
    runDurationMs = 0;
    completedRunSaveStarted = false;
    gameTitle.textContent = `Solo / ${MODE_LABELS[getSelectedMode()]}`;
    navigate("playing");
    renderer.syncGameConfig(game);
    renderer.reset(game.getSnapshot().boardRotation);
    resetLastFrameTime();
    canvas.focus();
  };

  const resetGame = (): void => {
    startGame();
  };

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
    if (e.code === "Escape" && !tipsPopover.hidden) {
      setTipsOpen(false);
      e.preventDefault();
      return true;
    }
    if (getAppScreen() !== "playing") return false;
    if (e.code === "KeyP") {
      setPaused(!getPaused());
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
  backToSetupButton.addEventListener("click", () => navigate("setup"));
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

  const stepFrame = (dtMs: number): void => {
    const game = getGame();
    if (getAppScreen() === "playing" && game && !getPaused()) {
      runDurationMs += dtMs;
      game.tick(dtMs);
      renderer.updateRotation(game.getSnapshot().boardRotation, dtMs);
    }
  };

  const drawFrame = (dtMs: number): void => {
    const game = getGame();
    if (getAppScreen() !== "playing" || !game) return;
    const gravityIntervalMs = game.getSnapshot().gravityIntervalMs;
    gameplayController.update(dtMs, gravityIntervalMs);
    renderer.draw(game, getPaused());
    const summary = game.getRunSummary(runDurationMs);
    if (summary.gameOver && !completedRunSaveStarted) {
      completedRunSaveStarted = true;
      void persistCompletedRun(summary, runDurationMs);
    }
  };

  const onResize = (): void => {
    const game = getGame();
    if (game) renderer.syncGameConfig(game);
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
