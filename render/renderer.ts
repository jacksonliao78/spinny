import { Game } from "@game/game";
import { SOLID_CELL } from "@game/board/types";
import { Piece } from "@game/piece";
import type { PieceType } from "@game/piece";
import type { BoardCell } from "@game/board/types";
import { getBoardBoundsFromLocked, isWithinBoard } from "./playfieldCoords";
import { BOARD_PADDING, BOARD_CELL_SIZE } from "./boardCanvasLayout";
import { drawPieceCell, drawSolidCell } from "./boardCellPainter";

const CELL = BOARD_CELL_SIZE;
const PADDING = BOARD_PADDING;
const SPIN_DURATION_MS = 180;
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
};

type Renderer = {
  syncGameConfig: (game: Game) => void;
  updateRotation: (boardRotation: number, dtMs: number) => void;
  draw: (game: Game, paused: boolean) => void;
  clear: () => void;
  isSpinAnimating: () => boolean;
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
  const slot = canvas.parentElement;
  if (slot instanceof HTMLElement && slot.clientWidth > 0 && slot.clientHeight > 0) {
    return {
      width: Math.max(1, slot.clientWidth),
      height: Math.max(1, slot.clientHeight),
    };
  }

  const w = typeof window !== "undefined" ? window.innerWidth : 640;
  const h = typeof window !== "undefined" ? Math.max(1, window.innerHeight - 120) : 480;
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

function getDisplayScale(canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): number {
  const available = getAvailableCanvasSize(canvas);
  const scale = Math.min(1, available.width / logicalWidth, available.height / logicalHeight);
  return Math.max(MIN_DISPLAY_SCALE, scale);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Board-only canvas renderer: playfield, rotation animation, and overlays. */
function createRenderer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Renderer {
  let displayedTurns = 0;
  let targetTurns = 0;
  let animStartTurns = 0;
  let animElapsedMs = 0;
  let spinAnimating = false;
  let lastBoardRotation = 0;

  const syncGameConfig = (game: Game): void => {
    const width = game.board.width * CELL + PADDING * 2;
    const height = game.board.height * CELL + PADDING * 2;
    setCanvasSize(canvas, ctx, width, height, getDisplayScale(canvas, width, height));
  };

  const updateRotation = (boardRotation: number, dtMs: number): void => {
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
    const layout = buildLayoutMetrics(snap);
    ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);
    drawPlayfield(game, snap, layout);
    drawOverlay(snap, paused, layout);
  };

  const clear = (): void => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const buildLayoutMetrics = (snap: ReturnType<Game["getSnapshot"]>): LayoutMetrics => {
    const bounds = getBoardBoundsFromLocked(snap.locked);
    const fullWidth = bounds.width;
    const fullHeight = bounds.height;
    const playWidth = fullWidth * CELL;
    const playHeight = fullHeight * CELL;
    const boardX = PADDING;
    const boardY = PADDING;
    return {
      boardX,
      boardY,
      fullWidth,
      fullHeight,
      playWidth,
      playHeight,
      canvasWidth: playWidth + PADDING * 2,
      canvasHeight: playHeight + PADDING * 2,
      viewX: snap.viewOffsetX * CELL,
      viewY: snap.viewOffsetY * CELL,
      viewW: snap.width * CELL,
      viewH: snap.height * CELL,
    };
  };

  const drawPlayfield = (
    game: Game,
    snap: ReturnType<Game["getSnapshot"]>,
    layout: LayoutMetrics,
  ): void => {
    const layoutBounds = { width: layout.fullWidth, height: layout.fullHeight };
    const drawCell = (x: number, y: number, type: PieceType, alpha = 1, ghost = false) => {
      drawPieceCell(ctx, x, y, type, alpha);
      if (ghost) {
        ctx.fillStyle = "rgba(7, 13, 22, 0.35)";
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      }
    };
    const drawLockedCell = (x: number, y: number, cell: BoardCell, alpha = 1) => {
      if (cell === null) return;
      ctx.globalAlpha = alpha;
      if (cell === SOLID_CELL) {
        drawSolidCell(ctx, x, y, alpha);
      } else {
        drawPieceCell(ctx, x, y, cell, alpha);
      }
      ctx.globalAlpha = 1;
    };

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
          if (isWithinBoard(layoutBounds, ghostCellX, ghostCellY)) {
            drawCell(ghostCellX, ghostCellY, p.type, 0.2, true);
          }
        }
      }
      for (const [rowIdx, row] of shape.entries()) {
        for (const [colIdx, cell] of row.entries()) {
          if (cell === 0) continue;
          const x = p.x + colIdx;
          const y = p.y + rowIdx;
          if (isWithinBoard(layoutBounds, x, y)) {
            drawCell(x, y, p.type);
          }
        }
      }
    }
    ctx.restore();
  };

  const drawOverlay = (
    snap: ReturnType<Game["getSnapshot"]>,
    paused: boolean,
    layout: LayoutMetrics,
  ): void => {
    if (!paused && !snap.gameOver && snap.b2b >= 3) {
      const x = layout.boardX + layout.viewX + 10;
      const y = layout.boardY + layout.viewY + 20;
      ctx.save();
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 6;
      ctx.fillText(`B2B ${snap.b2b}`, x, y);
      ctx.restore();
    }

    if (paused && !snap.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(layout.boardX, layout.boardY, layout.playWidth, layout.playHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", layout.boardX + layout.playWidth / 2, layout.boardY + layout.playHeight / 2);
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
    clear,
    isSpinAnimating,
    reset,
  };
}

export { createRenderer };
