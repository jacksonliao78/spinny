import { Game } from "@game/game";
import { createBoard } from "@game/board/factory";
import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import { createRenderer } from "./render/renderer";

type AppScreen = "landing" | "setup" | "playing";

const MODE_LABELS: Record<GameMode, string> = {
  timed: "Timed",
  marathon: "Marathon",
  zen: "Zen",
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
  const soloButton = getElement<HTMLButtonElement>("solo-button");
  const backToLandingButton = getElement<HTMLButtonElement>("back-to-landing-button");
  const backToSetupButton = getElement<HTMLButtonElement>("back-to-setup-button");
  const startGameButton = getElement<HTMLButtonElement>("start-game-button");
  const boardSelect = getElement<HTMLSelectElement>("board-select");
  const gameTitle = getElement<HTMLElement>("game-title");
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button[data-mode]"));
  const canvas = getElement<HTMLCanvasElement>("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let appScreen: AppScreen = "landing";
  let selectedMode: GameMode = "timed";
  let selectedBoard: BoardKind = "ring";
  let game: Game | null = null;
  let paused = false;
  const renderer = createRenderer(canvas, ctx);

  const setScreen = (nextScreen: AppScreen): void => {
    appScreen = nextScreen;
    landingScreen.classList.toggle("screen--active", nextScreen === "landing");
    setupScreen.classList.toggle("screen--active", nextScreen === "setup");
    gameScreen.classList.toggle("screen--active", nextScreen === "playing");
    if (nextScreen !== "playing") paused = true;
  };

  const makeGameConfig = () => ({
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
  });

  let last = performance.now();

  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (appScreen === "playing" && game && !paused) {
      game.tick(dt);
      renderer.updateRotation(game.getSnapshot().boardRotation, dt);
    }
    if (appScreen === "playing" && game) {
      renderer.draw(game, paused);
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  canvas.addEventListener("click", () => canvas.focus());

  soloButton.addEventListener("click", () => setScreen("setup"));
  backToLandingButton.addEventListener("click", () => setScreen("landing"));
  backToSetupButton.addEventListener("click", () => setScreen("setup"));
  startGameButton.addEventListener("click", () => startGame());
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode as GameMode;
      modeButtons.forEach((modeButton) => {
        modeButton.classList.toggle("mode-button--selected", modeButton === button);
      });
    });
  });
  boardSelect.addEventListener("change", () => {
    selectedBoard = boardSelect.value as BoardKind;
  });

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
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

  const handleGameplayKeys = (e: KeyboardEvent): boolean => {
    const currentGame = game;
    if (!currentGame) return false;

    switch (e.code) {
      case "ArrowLeft":
        currentGame.moveLeft();
        return true;
      case "ArrowRight":
        currentGame.moveRight();
        return true;
      case "ArrowDown":
        currentGame.softDrop();
        return true;
      case "ArrowUp":
        currentGame.rotateCw();
        return true;
      case "KeyZ":
        currentGame.rotateCcw();
        return true;
      case "KeyX":
        currentGame.rotateCw();
        return true;
      case "Space":
        currentGame.hardDrop();
        return true;
      case "KeyC":
        currentGame.hold();
        return true;
      default:
        return false;
    }
  };

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (handleGlobalKeys(e)) return;
    if (appScreen !== "playing" || !game || paused || game.getSnapshot().gameOver || renderer.isSpinAnimating()) {
      e.preventDefault();
      return;
    }
    const handled = handleGameplayKeys(e);
    if (!handled) return;
    e.preventDefault();
  });

  setScreen("landing");
}

main();
