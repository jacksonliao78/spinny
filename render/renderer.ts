import { Game } from "@game/game";
import { PIECE_ROTATIONS } from "@game/piece";
import { Piece } from "@game/piece";
import type { PieceType } from "@game/piece";

const CELL = 24;
const PANEL_WIDTH = 178;
const PADDING = 20;
const PANEL_INNER_GAP = 10;
const SPIN_DURATION_MS = 180;

type PieceStyle = {
  fill: string;
  edge: string;
  glow: string;
};

const PIECE_STYLES: Record<PieceType, PieceStyle> = {
  O: { fill: "#f7dc83", edge: "#c4ab56", glow: "#f7dc83" },
  I: { fill: "#7ed7ef", edge: "#4f9dbf", glow: "#7ed7ef" },
  Z: { fill: "#de7ea0", edge: "#a55674", glow: "#de7ea0" },
  S: { fill: "#72d89d", edge: "#479368", glow: "#72d89d" },
  L: { fill: "#bf8a69", edge: "#8e6347", glow: "#bf8a69" },
  J: { fill: "#6f7ddb", edge: "#4b56a6", glow: "#6f7ddb" },
  T: { fill: "#a276d9", edge: "#6f4ca4", glow: "#a276d9" },
};

const OBSTACLE_COLOR = "#6b7280";

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

  const style = PIECE_STYLES[type];
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 0) continue;
      const px = offsetX + (col - minX) * size;
      const py = offsetY + (row - minY) * size;
      const inset = 1;
      const w = size - inset * 2;
      const h = size - inset * 2;
      const gradient = ctx.createLinearGradient(px, py, px, py + size);
      gradient.addColorStop(0, "rgba(255,255,255,0.2)");
      gradient.addColorStop(0.28, style.fill);
      gradient.addColorStop(1, style.edge);
      ctx.fillStyle = gradient;
      ctx.fillRect(px + inset, py + inset, w, h);
      ctx.strokeStyle = "rgba(235, 243, 255, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, w - 1, h - 1);
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
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, "#1a2232");
  gradient.addColorStop(1, "#101725");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#2e3f5b";
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#d6e4ff";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, x + PANEL_INNER_GAP, y + 22);
  ctx.strokeStyle = "rgba(214, 228, 255, 0.2)";
  ctx.beginPath();
  ctx.moveTo(x + PANEL_INNER_GAP, y + 30);
  ctx.lineTo(x + width - PANEL_INNER_GAP, y + 30);
  ctx.stroke();
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function drawStyledCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: PieceStyle,
  alpha = 1,
): void {
  const px = x * CELL;
  const py = y * CELL;
  const inset = 1.5;
  const w = CELL - inset * 2;
  const h = CELL - inset * 2;
  const gradient = ctx.createLinearGradient(px, py, px, py + CELL);
  gradient.addColorStop(0, "rgba(255,255,255,0.22)");
  gradient.addColorStop(0.3, style.fill);
  gradient.addColorStop(1, style.edge);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = 8;
  ctx.fillRect(px + inset, py + inset, w, h);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(236, 244, 255, 0.48)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, w - 1, h - 1);

  ctx.fillStyle = "rgba(255,255,255,0.11)";
  ctx.fillRect(px + 4, py + 4, CELL - 8, 5);
  ctx.restore();
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
    const fullWidth = game.board.width;
    const fullHeight = game.board.height;
    const playWidth = fullWidth * CELL;
    const playHeight = fullHeight * CELL;
    const canvasWidth = playWidth + PANEL_WIDTH * 2 + PADDING * 2;
    const canvasHeight = playHeight + PADDING * 2;
    const viewX = snap.viewOffsetX * CELL;
    const viewY = snap.viewOffsetY * CELL;
    const viewW = snap.width * CELL;
    const viewH = snap.height * CELL;

    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    bgGradient.addColorStop(0, "#0a101a");
    bgGradient.addColorStop(1, "#0f1726");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const drawCell = (x: number, y: number, type: PieceType, alpha = 1, ghost = false) => {
      drawStyledCell(ctx, x, y, PIECE_STYLES[type], alpha);
      if (ghost) {
        ctx.fillStyle = "rgba(7, 13, 22, 0.35)";
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      }
    };

    const drawLockedCell = (x: number, y: number, cell: PieceType | null | 1, alpha = 1) => {
      if (cell === null) return;
      ctx.globalAlpha = alpha;
      if (cell === 1) {
        ctx.fillStyle = OBSTACLE_COLOR;
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, 6);
      } else {
        drawStyledCell(ctx, x, y, PIECE_STYLES[cell], alpha);
      }
      ctx.globalAlpha = 1;
    };

    // Rotate only the playfield; HUD panels stay fixed.
    ctx.save();
    ctx.translate(boardX + playWidth / 2, boardY + playHeight / 2);
    ctx.rotate((displayedTurns % 4) * (Math.PI / 2));
    ctx.translate(-playWidth / 2, -playHeight / 2);

    // Full board area includes spawn buffer.
    ctx.fillStyle = "#111a2a";
    ctx.fillRect(0, 0, playWidth, playHeight);
    // Main playfield gets the stronger frame.
    ctx.fillStyle = "#0f1728";
    ctx.fillRect(viewX, viewY, viewW, viewH);
    ctx.strokeStyle = "#3b4e6e";
    ctx.strokeRect(viewX, viewY, viewW, viewH);

    // Draw grid only in the main visible playfield.
    for (let y = 0; y <= snap.height; y++) {
      ctx.strokeStyle = "#1c2738";
      ctx.beginPath();
      ctx.moveTo(viewX, viewY + y * CELL);
      ctx.lineTo(viewX + viewW, viewY + y * CELL);
      ctx.stroke();
    }
    for (let x = 0; x <= snap.width; x++) {
      ctx.strokeStyle = "#1c2738";
      ctx.beginPath();
      ctx.moveTo(viewX + x * CELL, viewY);
      ctx.lineTo(viewX + x * CELL, viewY + viewH);
      ctx.stroke();
    }

    // Locked stack.
    for (let y = 0; y < fullHeight; y++) {
      for (let x = 0; x < fullWidth; x++) {
        const c = snap.locked[y][x];
        if (c !== null) drawLockedCell(x, y, c);
      }
    }

    // Active piece + ghost preview.
    if (snap.active) {
      const p = snap.active;
      const [gx, gy] = game.board.gravityDelta();
      const ghost = new Piece(p.type, p.x, p.y);
      ghost.rotation = p.rotation;
      while (game.canMovePiece(ghost, gx, gy)) {
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
            ghostCellY < fullHeight &&
            ghostCellX >= 0 &&
            ghostCellX < fullWidth
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
          if (y >= 0 && y < fullHeight && x >= 0 && x < fullWidth) {
            drawCell(x, y, p.type);
          }
        }
      }
    }
    ctx.restore();

    // Side panels and status text.
    const panelWidth = PANEL_WIDTH - PADDING;
    drawPanel(ctx, PADDING, PADDING, panelWidth, 170, "Hold");
    if (snap.hold) {
      drawMiniPiece(ctx, snap.hold, PADDING + 16, PADDING + 48, 18);
    }
    drawPanel(ctx, PADDING, PADDING + 184, panelWidth, 220, "Stats");
    ctx.fillStyle = "#dbe7ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Rotation: ${snap.boardRotation}`, PADDING + PANEL_INNER_GAP, PADDING + 218);
    ctx.fillText(
      `Gravity: ${game.board.gravityDelta().join(", ")}`,
      PADDING + PANEL_INNER_GAP,
      PADDING + 244,
    );
    ctx.fillText(`View: ${snap.width}x${snap.height}`, PADDING + PANEL_INNER_GAP, PADDING + 270);
    ctx.fillText(`Full: ${fullWidth}x${fullHeight}`, PADDING + PANEL_INNER_GAP, PADDING + 296);
    ctx.fillText(
      `Offset: ${snap.viewOffsetX},${snap.viewOffsetY}`,
      PADDING + PANEL_INNER_GAP,
      PADDING + 322,
    );
    ctx.fillText(
      `State: ${snap.gameOver ? "Game Over" : paused ? "Paused" : "Running"}`,
      PADDING + PANEL_INNER_GAP,
      PADDING + 348,
    );
    ctx.fillStyle = "#9aaed1";
    ctx.fillText("P: Pause", PADDING + PANEL_INNER_GAP, PADDING + 376);
    ctx.fillText("R: Restart", PADDING + PANEL_INNER_GAP, PADDING + 396);

    const rightX = boardX + playWidth + PADDING;
    drawPanel(ctx, rightX, PADDING, panelWidth, playHeight, "Next");
    snap.next.slice(0, 5).forEach((type, idx) => {
      drawMiniPiece(ctx, type, rightX + 16, PADDING + 42 + idx * 88, 15);
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
