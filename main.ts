import { Game } from "@game/game";
import { DEFAULT_GAME_RULES } from "@game/game/rules";
import { createRenderer } from "./render/renderer";

const TIMED_DURATION_MS = 180_000;

const GAME_CONFIG = {
  mode: "timed" as const,
  timed: {
    durationMs: TIMED_DURATION_MS,
  },
};

function main(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let game = new Game(
    DEFAULT_GAME_RULES.width,
    DEFAULT_GAME_RULES.height,
    DEFAULT_GAME_RULES.gravityIntervalMs,
    undefined,
    GAME_CONFIG,
  );
  let paused = false;
  const renderer = createRenderer(canvas, ctx);
  const resetGame = (): void => {
    game = new Game(
      DEFAULT_GAME_RULES.width,
      DEFAULT_GAME_RULES.height,
      DEFAULT_GAME_RULES.gravityIntervalMs,
      undefined,
      GAME_CONFIG,
    );
    paused = false;
    renderer.syncGameConfig(game);
    renderer.reset(game.getSnapshot().boardRotation);
  };
  resetGame();
  window.addEventListener("resize", () => renderer.syncGameConfig(game));

  let last = performance.now();

  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (!paused) {
      game.tick(dt);
      renderer.updateRotation(game.getSnapshot().boardRotation, dt);
    }
    renderer.draw(game, paused);
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  canvas.addEventListener("click", () => canvas.focus());

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
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
    switch (e.code) {
      case "ArrowLeft":
        game.moveLeft();
        return true;
      case "ArrowRight":
        game.moveRight();
        return true;
      case "ArrowDown":
        game.softDrop();
        return true;
      case "ArrowUp":
        game.rotateCw();
        return true;
      case "KeyZ":
        game.rotateCcw();
        return true;
      case "KeyX":
        game.rotateCw();
        return true;
      case "Space":
        game.hardDrop();
        return true;
      case "KeyC":
        game.hold();
        return true;
      default:
        return false;
    }
  };

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (handleGlobalKeys(e)) return;
    if (paused || game.getSnapshot().gameOver || renderer.isSpinAnimating()) {
      e.preventDefault();
      return;
    }
    const handled = handleGameplayKeys(e);
    if (!handled) return;
    e.preventDefault();
  });
}

main();
