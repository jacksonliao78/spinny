import { Game } from "@game/game";
import { createRenderer } from "./render/renderer";

const BOARD_SIZE = 20;
const GRAVITY_MS = 700;

function main(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let game = new Game(BOARD_SIZE, BOARD_SIZE, GRAVITY_MS);
  let paused = false;
  const renderer = createRenderer(canvas, ctx);
  renderer.syncGameConfig(game);
  renderer.reset(game.getSnapshot().boardRotation);
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

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "KeyP") {
      paused = !paused;
      e.preventDefault();
      return;
    }
    if (e.code === "KeyR") {
      game = new Game(BOARD_SIZE, BOARD_SIZE, GRAVITY_MS);
      paused = false;
      renderer.syncGameConfig(game);
      renderer.reset(game.getSnapshot().boardRotation);
      e.preventDefault();
      return;
    }
    if (paused || game.getSnapshot().gameOver || renderer.isSpinAnimating()) {
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case "ArrowLeft":
        game.moveLeft();
        break;
      case "ArrowRight":
        game.moveRight();
        break;
      case "ArrowDown":
        game.softDrop();
        break;
      case "ArrowUp":
        game.rotateCw();
        break;
      case "KeyZ":
        game.rotateCcw();
        break;
      case "KeyX":
        game.rotateCw();
        break;
      case "Space":
        e.preventDefault();
        game.hardDrop();
        break;
      case "KeyC":
        game.hold();
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}

main();
