import { Game } from "@game/game";
import { PIECE_ROTATIONS } from "@game/piece";
import { Piece } from "@game/piece";
import type { PieceType } from "@game/piece";

const CELL = 28;
const PANEL_WIDTH = 150;
const PADDING = 12;
const SPIN_DURATION_MS = 180;

const COLORS: Record<PieceType, string> = {
  O: "#f1c40f",
  I: "#3498db",
  Z: "#e74c3c",
  S: "#2ecc71",
  L: "#e67e22",
  J: "#9b59b6",
  T: "#1abc9c",
};

type Renderer = {
  // Recompute canvas size when game dimensions change.
  syncGameConfig: (game: Game) => void;
  // Advance spin animation toward the latest board rotation.
  updateRotation: (boardRotation: number, dtMs: number) => void;
  // Draw full frame (playfield + side panels).
  draw: (game: Game, paused: boolean) => void;
  // Used by input handling to briefly freeze controls mid-spin.
  isSpinAnimating: () => boolean;
  // Reset animation state (e.g. on restart).
  reset: (boardRotation?: number) => void;
};

function setCanvasSize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  x: number,
  y: number,
  size = 14,
): void {
  const shape = PIECE_ROTATIONS[type][0];
  let minX = 4;
  let minY = 4;
  let maxX = 0;
  let maxY = 0;
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 0) continue;
      minX = Math.min(minX, col);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, col);
      maxY = Math.max(maxY, row);
    }
  }
  const pieceWidth = (maxX - minX + 1) * size;
  const pieceHeight = (maxY - minY + 1) * size;
  const offsetX = x + (4 * size - pieceWidth) / 2;
  const offsetY = y + (4 * size - pieceHeight) / 2;

  ctx.fillStyle = COLORS[type];
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 0) continue;
      const px = offsetX + (col - minX) * size;
      const py = offsetY + (row - minY) * size;
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    }
  }
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
): void {
  ctx.fillStyle = "#171b24";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#31394a";
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#aeb9d4";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, x + 10, y + 20);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function createRenderer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Renderer {
  // Rotation animation state in quarter-turn units.
  let displayedTurns = 0;
  let targetTurns = 0;
  let animStartTurns = 0;
  let animElapsedMs = 0;
  let spinAnimating = false;
  let lastBoardRotation = 0;

  const syncGameConfig = (game: Game): void => {
    const width = game.board.width * CELL + PANEL_WIDTH * 2 + PADDING * 2;
    const height = game.board.height * CELL + PADDING * 2;
    setCanvasSize(canvas, ctx, width, height);
  };

  const updateRotation = (boardRotation: number, dtMs: number): void => {
    // Detect lock-triggered board rotation and start a new tween.
    const delta = (boardRotation - lastBoardRotation + 4) % 4;
    if (delta > 0) {
      animStartTurns = displayedTurns;
      targetTurns += delta;
      animElapsedMs = 0;
      spinAnimating = true;
    }
    lastBoardRotation = boardRotation;

    if (spinAnimating) {
      animElapsedMs += dtMs;
      const t = Math.min(1, animElapsedMs / SPIN_DURATION_MS);
      displayedTurns = animStartTurns + (targetTurns - animStartTurns) * easeOutCubic(t);
      if (t >= 1) {
        displayedTurns = targetTurns;
        spinAnimating = false;
      }
    }
  };

  const draw = (game: Game, paused: boolean): void => {
    const snap = game.getSnapshot();
    const boardX = PADDING + PANEL_WIDTH;
    const boardY = PADDING;
    const playWidth = snap.width * CELL;
    const playHeight = snap.height * CELL;
    const canvasWidth = playWidth + PANEL_WIDTH * 2 + PADDING * 2;
    const canvasHeight = playHeight + PADDING * 2;

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const drawCell = (x: number, y: number, type: PieceType, alpha = 1, ghost = false) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS[type];
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      if (!ghost) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, 6);
      }
      ctx.globalAlpha = 1;
    };

    // Rotate only the playfield; HUD panels stay fixed.
    ctx.save();
    ctx.translate(boardX + playWidth / 2, boardY + playHeight / 2);
    ctx.rotate((displayedTurns % 4) * (Math.PI / 2));
    ctx.translate(-playWidth / 2, -playHeight / 2);

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, playWidth, playHeight);
    ctx.strokeStyle = "#273247";
    ctx.strokeRect(0, 0, playWidth, playHeight);

    for (let y = 0; y <= snap.height; y++) {
      ctx.strokeStyle = "#1a2230";
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(playWidth, y * CELL);
      ctx.stroke();
    }
    for (let x = 0; x <= snap.width; x++) {
      ctx.strokeStyle = "#1a2230";
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, playHeight);
      ctx.stroke();
    }

    // Locked stack.
    for (let y = 0; y < snap.height; y++) {
      for (let x = 0; x < snap.width; x++) {
        const c = snap.locked[y][x];
        if (c) drawCell(x, y, c);
      }
    }

    // Active piece + ghost preview.
    if (snap.active) {
      const p = snap.active;
      const [gx, gy] = game.board.gravityDelta();
      const ghost = new Piece(p.type, p.x, p.y);
      ghost.rotation = p.rotation;
      while (game.board.canMove(ghost, gx, gy)) {
        ghost.move(gx, gy);
      }
      const shape = p.get_shape(p.rotation);
      for (const [rowIdx, row] of shape.entries()) {
        for (const [colIdx, cell] of row.entries()) {
          if (cell === 0) continue;
          const ghostCellX = ghost.x + colIdx;
          const ghostCellY = ghost.y + rowIdx;
          if (
            ghostCellY >= 0 &&
            ghostCellY < snap.height &&
            ghostCellX >= 0 &&
            ghostCellX < snap.width
          ) {
            drawCell(ghostCellX, ghostCellY, p.type, 0.2, true);
          }
        }
      }
      for (const [rowIdx, row] of shape.entries()) {
        for (const [colIdx, cell] of row.entries()) {
          if (cell === 0) continue;
          const x = p.x + colIdx;
          const y = p.y + rowIdx;
          if (y >= 0 && y < snap.height && x >= 0 && x < snap.width) {
            drawCell(x, y, p.type);
          }
        }
      }
    }
    ctx.restore();

    // Side panels and status text.
    drawPanel(ctx, PADDING, PADDING, PANEL_WIDTH - PADDING, 160, "Hold");
    if (snap.hold) {
      drawMiniPiece(ctx, snap.hold, PADDING + 14, PADDING + 40, 20);
    }
    drawPanel(ctx, PADDING, PADDING + 172, PANEL_WIDTH - PADDING, 150, "Stats");
    ctx.fillStyle = "#d6deeb";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Rotation: ${snap.boardRotation}`, PADDING + 10, PADDING + 205);
    ctx.fillText(`Gravity: ${game.board.gravityDelta().join(", ")}`, PADDING + 10, PADDING + 230);
    ctx.fillText(
      `State: ${snap.gameOver ? "Game Over" : paused ? "Paused" : "Running"}`,
      PADDING + 10,
      PADDING + 255,
    );
    ctx.fillStyle = "#93a1bb";
    ctx.fillText("P: Pause", PADDING + 10, PADDING + 285);
    ctx.fillText("R: Restart", PADDING + 10, PADDING + 305);

    const rightX = boardX + playWidth + PADDING;
    drawPanel(ctx, rightX, PADDING, PANEL_WIDTH - PADDING, playHeight, "Next");
    snap.next.slice(0, 5).forEach((type, idx) => {
      drawMiniPiece(ctx, type, rightX + 14, PADDING + 34 + idx * 92, 14);
    });

    if (paused && !snap.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(boardX, boardY, playWidth, playHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", boardX + playWidth / 2, boardY + playHeight / 2);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("Press P to resume", boardX + playWidth / 2, boardY + playHeight / 2 + 26);
    }

    if (snap.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(boardX, boardY, playWidth, playHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game over", boardX + playWidth / 2, boardY + playHeight / 2);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("Press R to restart", boardX + playWidth / 2, boardY + playHeight / 2 + 24);
    }
  };

  const isSpinAnimating = (): boolean => spinAnimating;

  const reset = (boardRotation = 0): void => {
    displayedTurns = 0;
    targetTurns = 0;
    animStartTurns = 0;
    animElapsedMs = 0;
    spinAnimating = false;
    lastBoardRotation = boardRotation;
  };

  return {
    syncGameConfig,
    updateRotation,
    draw,
    isSpinAnimating,
    reset,
  };
}

export { createRenderer };
