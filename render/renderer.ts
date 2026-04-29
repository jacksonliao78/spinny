import { Game } from "@game/game";
import { SOLID_CELL } from "@game/board/types";
import { PIECE_ROTATIONS } from "@game/piece";
import { Piece } from "@game/piece";
import type { PieceType } from "@game/piece";
import type { BoardCell } from "@game/board/types";

const CELL = 26;
const PANEL_WIDTH = 178;
const PADDING = 20;
const PANEL_INNER_GAP = 10;
const SPIN_DURATION_MS = 180;
const HOLD_PANEL_HEIGHT = 170;
const STATS_PANEL_Y = PADDING + 184;
const STATS_PANEL_HEIGHT = 220;
const NEXT_ITEM_SPACING = 88;
const MIN_DISPLAY_SCALE = 0.55;

type LayoutMetrics = {
  boardX: number;
  boardY: number;
  fullWidth: number;
  fullHeight: number;
  playWidth: number;
  playHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  viewX: number;
  viewY: number;
  viewW: number;
  viewH: number;
  panelWidth: number;
  rightPanelX: number;
};

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
  logicalWidth: number,
  logicalHeight: number,
  displayScale = 1,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.round(logicalWidth * displayScale)}px`;
  canvas.style.height = `${Math.round(logicalHeight * displayScale)}px`;
  canvas.width = Math.floor(logicalWidth * dpr);
  canvas.height = Math.floor(logicalHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function getAvailableCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const parent = canvas.parentElement;
  const parentWidth = parent?.clientWidth ?? window.innerWidth;
  return {
    width: Math.max(1, parentWidth),
    height: Math.max(1, window.innerHeight - 180),
  };
}

function getDisplayScale(canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): number {
  const available = getAvailableCanvasSize(canvas);
  const scale = Math.min(1, available.width / logicalWidth, available.height / logicalHeight);
  return Math.max(MIN_DISPLAY_SCALE, scale);
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
  _height: number,
  title: string,
): void {
  ctx.fillStyle = "rgba(214, 228, 255, 0.82)";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, x + PANEL_INNER_GAP, y + 22);
  ctx.strokeStyle = "rgba(214, 228, 255, 0.12)";
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

/** Canvas renderer owns sizing, board spin animation, and HUD drawing; gameplay stays in Game. */
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
    setCanvasSize(canvas, ctx, width, height, getDisplayScale(canvas, width, height));
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
    const layout = buildLayoutMetrics(game, snap);
    drawBackground(layout);
    drawPlayfield(game, snap, layout);
    drawSidePanels(snap, layout);
    drawOverlay(snap, paused, layout);
  };

  const formatTimer = (ms: number | null): string => {
    if (ms === null) return "--:--";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const buildLayoutMetrics = (game: Game, snap: ReturnType<Game["getSnapshot"]>): LayoutMetrics => {
    const fullWidth = game.board.width;
    const fullHeight = game.board.height;
    const playWidth = fullWidth * CELL;
    const playHeight = fullHeight * CELL;
    const boardX = PADDING + PANEL_WIDTH;
    const boardY = PADDING;
    const panelWidth = PANEL_WIDTH - PADDING;
    return {
      boardX,
      boardY,
      fullWidth,
      fullHeight,
      playWidth,
      playHeight,
      canvasWidth: playWidth + PANEL_WIDTH * 2 + PADDING * 2,
      canvasHeight: playHeight + PADDING * 2,
      viewX: snap.viewOffsetX * CELL,
      viewY: snap.viewOffsetY * CELL,
      viewW: snap.width * CELL,
      viewH: snap.height * CELL,
      panelWidth,
      rightPanelX: boardX + playWidth + PADDING,
    };
  };

  const drawBackground = (layout: LayoutMetrics): void => {
    const bgGradient = ctx.createLinearGradient(0, 0, 0, layout.canvasHeight);
    bgGradient.addColorStop(0, "#2a2233");
    bgGradient.addColorStop(0.55, "#39293e");
    bgGradient.addColorStop(1, "#263546");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

    const accentGlow = ctx.createRadialGradient(
      layout.canvasWidth * 0.48,
      layout.canvasHeight * 0.78,
      0,
      layout.canvasWidth * 0.48,
      layout.canvasHeight * 0.78,
      layout.canvasHeight * 0.62,
    );
    accentGlow.addColorStop(0, "rgba(185, 157, 232, 0.2)");
    accentGlow.addColorStop(1, "rgba(185, 157, 232, 0)");
    ctx.fillStyle = accentGlow;
    ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  };

  const drawPlayfield = (
    game: Game,
    snap: ReturnType<Game["getSnapshot"]>,
    layout: LayoutMetrics,
  ): void => {
    const drawCell = (x: number, y: number, type: PieceType, alpha = 1, ghost = false) => {
      drawStyledCell(ctx, x, y, PIECE_STYLES[type], alpha);
      if (ghost) {
        ctx.fillStyle = "rgba(7, 13, 22, 0.35)";
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      }
    };
    const drawLockedCell = (x: number, y: number, cell: BoardCell, alpha = 1) => {
      if (cell === null) return;
      ctx.globalAlpha = alpha;
      if (cell === SOLID_CELL) {
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
    ctx.translate(layout.boardX + layout.playWidth / 2, layout.boardY + layout.playHeight / 2);
    ctx.rotate((displayedTurns % 4) * (Math.PI / 2));
    ctx.translate(-layout.playWidth / 2, -layout.playHeight / 2);

    ctx.fillStyle = "rgba(17, 26, 42, 0.58)";
    ctx.fillRect(0, 0, layout.playWidth, layout.playHeight);
    ctx.fillStyle = "rgba(15, 23, 40, 0.78)";
    ctx.fillRect(layout.viewX, layout.viewY, layout.viewW, layout.viewH);

    for (let y = 0; y <= snap.height; y++) {
      ctx.strokeStyle = "rgba(214, 228, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(layout.viewX, layout.viewY + y * CELL);
      ctx.lineTo(layout.viewX + layout.viewW, layout.viewY + y * CELL);
      ctx.stroke();
    }
    for (let x = 0; x <= snap.width; x++) {
      ctx.strokeStyle = "rgba(214, 228, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(layout.viewX + x * CELL, layout.viewY);
      ctx.lineTo(layout.viewX + x * CELL, layout.viewY + layout.viewH);
      ctx.stroke();
    }

    for (let y = 0; y < layout.fullHeight; y++) {
      for (let x = 0; x < layout.fullWidth; x++) {
        const c = snap.locked[y][x];
        if (c !== null) drawLockedCell(x, y, c);
      }
    }

    if (snap.active) {
      const p = snap.active;
      const [gx, gy] = game.board.gravityDelta();
      const ghost = new Piece(p.type, p.x, p.y);
      ghost.rotation = p.rotation;
      while (game.canMovePiece(ghost, gx, gy)) {
        ghost.move(gx, gy);
      }
      const shape = p.getShape(p.rotation);
      for (const [rowIdx, row] of shape.entries()) {
        for (const [colIdx, cell] of row.entries()) {
          if (cell === 0) continue;
          const ghostCellX = ghost.x + colIdx;
          const ghostCellY = ghost.y + rowIdx;
          if (
            ghostCellY >= 0 &&
            ghostCellY < layout.fullHeight &&
            ghostCellX >= 0 &&
            ghostCellX < layout.fullWidth
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
          if (y >= 0 && y < layout.fullHeight && x >= 0 && x < layout.fullWidth) {
            drawCell(x, y, p.type);
          }
        }
      }
    }
    ctx.restore();
  };

  const drawSidePanels = (snap: ReturnType<Game["getSnapshot"]>, layout: LayoutMetrics): void => {
    drawPanel(ctx, PADDING, PADDING, layout.panelWidth, HOLD_PANEL_HEIGHT, "Hold");
    if (snap.hold) {
      drawMiniPiece(ctx, snap.hold, PADDING + 16, PADDING + 48, 18);
    }

    drawPanel(ctx, PADDING, STATS_PANEL_Y, layout.panelWidth, STATS_PANEL_HEIGHT, "Stats");
    ctx.fillStyle = "#dbe7ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Timer: ${formatTimer(snap.remainingMs)}`, PADDING + PANEL_INNER_GAP, PADDING + 218);
    ctx.fillText(`Score: ${snap.score}`, PADDING + PANEL_INNER_GAP, PADDING + 244);
    ctx.fillText(`Level: ${snap.level}`, PADDING + PANEL_INNER_GAP, PADDING + 270);
    ctx.fillText(`Combo: ${snap.combo}`, PADDING + PANEL_INNER_GAP, PADDING + 296);
    ctx.fillText(`Lines: ${snap.linesClearedTotal}`, PADDING + PANEL_INNER_GAP, PADDING + 322);
    if (snap.garbageEnabled) {
      ctx.fillText(`Incoming: ${snap.incomingGarbage}`, PADDING + PANEL_INNER_GAP, PADDING + 348);
    }

    drawPanel(ctx, layout.rightPanelX, PADDING, layout.panelWidth, layout.playHeight, "Next");
    snap.next.slice(0, 5).forEach((type, idx) => {
      drawMiniPiece(ctx, type, layout.rightPanelX + 16, PADDING + 42 + idx * NEXT_ITEM_SPACING, 15);
    });
  };

  const drawOverlay = (
    snap: ReturnType<Game["getSnapshot"]>,
    paused: boolean,
    layout: LayoutMetrics,
  ): void => {
    if (paused && !snap.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(layout.boardX, layout.boardY, layout.playWidth, layout.playHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", layout.boardX + layout.playWidth / 2, layout.boardY + layout.playHeight / 2);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(
        "Press P to resume",
        layout.boardX + layout.playWidth / 2,
        layout.boardY + layout.playHeight / 2 + 26,
      );
    }

    if (snap.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(layout.boardX, layout.boardY, layout.playWidth, layout.playHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game over", layout.boardX + layout.playWidth / 2, layout.boardY + layout.playHeight / 2);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(
        "Press R to restart",
        layout.boardX + layout.playWidth / 2,
        layout.boardY + layout.playHeight / 2 + 24,
      );
    }

    ctx.textAlign = "left";
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
