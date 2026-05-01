import { Game } from "@game/game";
import { createBoard } from "@game/board/factory";
import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import { createRenderer } from "./render/renderer";
import { createMiniBoardRenderer } from "./render/miniBoard";
import {
  DEFAULT_INPUT_SETTINGS,
  clampInputSettings,
  formatSdfLabel,
  loadInputSettings,
  saveInputSettings,
  sdfFromSliderValue,
  sdfToSliderValue,
  type InputSettings,
} from "./input/settings";
import { createInputController, gameplayCallbacksFor } from "./input/controller";

type AppScreen = "landing" | "setup" | "playing" | "settings";

const MODE_LABELS: Record<GameMode, string> = {
  timed: "Timed",
  marathon: "Marathon",
  zen: "Zen",
};
const RECTANGULAR_BOARD_CONFIG = { width: 10, height: 20 };

const SETTINGS_TEST_CONFIG = {
  board: { width: 10, height: 20 },
  mode: { kind: "zen" as const },
};

const getElement = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: ${id}`);
  return el as T;
};

/** Browser entry point: owns DOM screens/input wiring, while Game and renderer own simulation/drawing. */
function main(): void {
  const landingScreen = getElement<HTMLElement>("landing-screen");
  const setupScreen = getElement<HTMLElement>("setup-screen");
  const gameScreen = getElement<HTMLElement>("game-screen");
  const settingsScreen = getElement<HTMLElement>("settings-screen");

  const soloButton = getElement<HTMLButtonElement>("solo-button");
  const settingsButton = getElement<HTMLButtonElement>("settings-button");
  const settingsBackButton = getElement<HTMLButtonElement>("settings-back-button");

  const backToLandingButton = getElement<HTMLButtonElement>("back-to-landing-button");
  const backToSetupButton = getElement<HTMLButtonElement>("back-to-setup-button");
  const startGameButton = getElement<HTMLButtonElement>("start-game-button");
  const tipsButton = getElement<HTMLButtonElement>("tips-button");
  const tipsPopover = getElement<HTMLElement>("tips-popover");
  const gameActions = getElement<HTMLElement>("game-actions");
  const gameTitle = getElement<HTMLElement>("game-title");
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button[data-mode]"));
  const boardButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".board-option[data-board]"));
  const canvas = getElement<HTMLCanvasElement>("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const settingsCanvas = getElement<HTMLCanvasElement>("settings-test-board");
  const settingsCtx = settingsCanvas.getContext("2d");
  if (!settingsCtx) return;

  const dasSlider = getElement<HTMLInputElement>("das-slider");
  const arrSlider = getElement<HTMLInputElement>("arr-slider");
  const dcdSlider = getElement<HTMLInputElement>("dcd-slider");
  const sdfSlider = getElement<HTMLInputElement>("sdf-slider");
  const dasValue = getElement<HTMLElement>("das-value");
  const arrValue = getElement<HTMLElement>("arr-value");
  const dcdValue = getElement<HTMLElement>("dcd-value");
  const sdfValue = getElement<HTMLElement>("sdf-value");
  const settingsResetButton = getElement<HTMLButtonElement>("settings-reset-button");

  let inputSettings: InputSettings = clampInputSettings(loadInputSettings());

  let appScreen: AppScreen = "landing";
  let selectedMode: GameMode = "timed";
  let selectedBoard: BoardKind = "ring";
  let game: Game | null = null;
  let testGame: Game | null = null;
  let settingsTestFocused = false;
  let paused = false;
  const renderer = createRenderer(canvas, ctx);
  const miniRenderer = createMiniBoardRenderer(settingsCanvas, settingsCtx);

  const gameplayController = createInputController(
    () => (game && !game.getSnapshot().gameOver ? gameplayCallbacksFor(game) : null),
    inputSettings,
  );

  const testController = createInputController(
    () => (testGame && !testGame.getSnapshot().gameOver ? gameplayCallbacksFor(testGame) : null),
    inputSettings,
  );

  gameplayController.attach(canvas);
  testController.attach(settingsCanvas);

  const applyInputSettings = (next: InputSettings): void => {
    inputSettings = clampInputSettings(next);
    saveInputSettings(inputSettings);
    gameplayController.setSettings(inputSettings);
    testController.setSettings(inputSettings);
  };

  const refreshSettingsUi = (): void => {
    const s = inputSettings;
    dasSlider.value = String(s.dasMs);
    arrSlider.value = String(s.arrMs);
    dcdSlider.value = String(s.dcdMs);
    sdfSlider.value = String(sdfToSliderValue(s.sdf));
    dasValue.textContent = `${s.dasMs}ms`;
    arrValue.textContent = `${s.arrMs}ms`;
    dcdValue.textContent = `${s.dcdMs}ms`;
    sdfValue.textContent = formatSdfLabel(s.sdf);
  };

  refreshSettingsUi();

  const setTipsOpen = (open: boolean): void => {
    tipsPopover.hidden = !open;
    tipsButton.setAttribute("aria-expanded", String(open));
  };

  const spinBlocksInput = (): boolean => {
    if (appScreen === "playing") return renderer.isSpinAnimating();
    return false;
  };

  const syncInputControllerState = (): void => {
    const playing = appScreen === "playing";
    const settings = appScreen === "settings";

    gameplayController.setEnabled(playing && !paused && !!game && !game.getSnapshot().gameOver && !spinBlocksInput());

    testController.setEnabled(settings && settingsTestFocused && !!testGame && !testGame.getSnapshot().gameOver);
  };

  const restartTestGame = (): void => {
    testGame = new Game({
      boardFactory: (width, height) => createBoard("rectangular", width, height),
      config: SETTINGS_TEST_CONFIG,
    });
    miniRenderer.syncSize(testGame);
  };

  const setScreen = (nextScreen: AppScreen): void => {
    appScreen = nextScreen;
    landingScreen.classList.toggle("screen--active", nextScreen === "landing");
    setupScreen.classList.toggle("screen--active", nextScreen === "setup");
    gameScreen.classList.toggle("screen--active", nextScreen === "playing");
    settingsScreen.classList.toggle("screen--active", nextScreen === "settings");

    if (nextScreen !== "playing") {
      paused = true;
      setTipsOpen(false);
    }

    if (nextScreen === "settings") {
      if (!testGame) restartTestGame();
      miniRenderer.syncSize(testGame!);
      settingsTestFocused = true;
      settingsCanvas.focus();
    } else {
      settingsTestFocused = false;
    }

    syncInputControllerState();
  };

  const makeGameConfig = () => ({
    ...(selectedBoard === "rectangular" ? { board: RECTANGULAR_BOARD_CONFIG } : {}),
    mode: {
      kind: selectedMode,
    },
  });

  const startGame = (): void => {
    game = new Game({
      boardFactory: (width, height) => createBoard(selectedBoard, width, height),
      config: makeGameConfig(),
    });
    paused = false;
    gameTitle.textContent = `Solo / ${MODE_LABELS[selectedMode]}`;
    setScreen("playing");
    renderer.syncGameConfig(game);
    renderer.reset(game.getSnapshot().boardRotation);
    last = performance.now();
    canvas.focus();
  };

  const resetGame = (): void => {
    startGame();
  };
  window.addEventListener("resize", () => {
    if (game) renderer.syncGameConfig(game);
    if (testGame) miniRenderer.syncSize(testGame);
  });

  let last = performance.now();

  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (appScreen === "playing" && game && !paused) {
      game.tick(dt);
      renderer.updateRotation(game.getSnapshot().boardRotation, dt);
    }
    if (appScreen === "settings" && testGame) {
      if (settingsTestFocused) {
        if (testGame.getSnapshot().gameOver) {
          restartTestGame();
        } else {
          testGame.tick(dt);
        }
      }
    }
    syncInputControllerState();
    if (appScreen === "playing" && game) {
      const g = game.getSnapshot().gravityIntervalMs;
      gameplayController.update(dt, g);
      renderer.draw(game, paused);
    }
    if (appScreen === "settings" && testGame) {
      const g = testGame.getSnapshot().gravityIntervalMs;
      testController.update(dt, g);
      miniRenderer.draw(testGame);
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  canvas.addEventListener("click", () => canvas.focus());
  settingsCanvas.addEventListener("click", () => {
    settingsTestFocused = true;
    settingsCanvas.focus();
    syncInputControllerState();
  });
  settingsCanvas.addEventListener("focus", () => {
    settingsTestFocused = true;
    syncInputControllerState();
  });
  settingsCanvas.addEventListener("blur", () => {
    settingsTestFocused = false;
    syncInputControllerState();
  });

  soloButton.addEventListener("click", () => setScreen("setup"));
  settingsButton.addEventListener("click", () => setScreen("settings"));
  settingsBackButton.addEventListener("click", () => setScreen("landing"));
  backToLandingButton.addEventListener("click", () => setScreen("landing"));
  backToSetupButton.addEventListener("click", () => setScreen("setup"));
  startGameButton.addEventListener("click", () => startGame());
  tipsButton.addEventListener("click", () => setTipsOpen(tipsPopover.hidden));
  document.addEventListener("click", (e) => {
    if (tipsPopover.hidden || gameActions.contains(e.target as Node)) return;
    setTipsOpen(false);
  });
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode as GameMode;
      modeButtons.forEach((modeButton) => {
        modeButton.classList.toggle("mode-button--selected", modeButton === button);
      });
    });
  });
  boardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedBoard = button.dataset.board as BoardKind;
      boardButtons.forEach((boardButton) => {
        const selected = boardButton === button;
        boardButton.classList.toggle("board-option--selected", selected);
        boardButton.setAttribute("aria-pressed", String(selected));
      });
    });
  });

  const readSlidersToSettings = (): InputSettings =>
    clampInputSettings({
      dasMs: Number(dasSlider.value),
      arrMs: Number(arrSlider.value),
      dcdMs: Number(dcdSlider.value),
      sdf: sdfFromSliderValue(Number(sdfSlider.value)),
    });

  dasSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });
  arrSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });
  dcdSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });
  sdfSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });

  settingsResetButton.addEventListener("click", () => {
    applyInputSettings(DEFAULT_INPUT_SETTINGS);
    refreshSettingsUi();
    restartTestGame();
  });

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
    if (e.code === "Escape" && !tipsPopover.hidden) {
      setTipsOpen(false);
      e.preventDefault();
      return true;
    }
    if (appScreen !== "playing") return false;
    if (e.code === "KeyP") {
      paused = !paused;
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

  const shouldBlockGameplayKey = (): boolean => {
    if (appScreen === "playing") {
      return !game || paused || game.getSnapshot().gameOver || spinBlocksInput();
    }
    if (appScreen === "settings") {
      return !testGame || testGame.getSnapshot().gameOver;
    }
    return true;
  };

  const blockHandledKeys = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowDown":
      case "ArrowUp":
      case "Space":
      case "KeyZ":
      case "KeyX":
      case "KeyC":
        e.preventDefault();
        return;
      default:
        return;
    }
  };

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (handleGlobalKeys(e)) return;
    if (appScreen !== "playing") {
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });

  settingsCanvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (appScreen !== "settings") {
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });

  applyInputSettings(inputSettings);
  setScreen("landing");
}

main();
