import { Game } from "@game/game";
import { SOLID_CELL } from "@game/board/types";
import { Piece } from "@game/piece";
import type { PieceType } from "@game/piece";
import type { BoardCell } from "@game/board/types";
import { getBoardBoundsFromLocked, isWithinBoard } from "./playfieldCoords";

const CELL = 22;
const PADDING = 14;
const MIN_SCALE = 0.45;

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

export type MiniBoardRenderer = {
  syncSize: (game: Game) => void;
  draw: (game: Game) => void;
};

function setCanvasSize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number,
  displayScale: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.round(logicalWidth * displayScale)}px`;
  canvas.style.height = `${Math.round(logicalHeight * displayScale)}px`;
  canvas.width = Math.floor(logicalWidth * dpr);
  canvas.height = Math.floor(logicalHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
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
  ctx.shadowBlur = 6;
  ctx.fillRect(px + inset, py + inset, w, h);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(236, 244, 255, 0.48)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, w - 1, h - 1);

  ctx.fillStyle = "rgba(255,255,255,0.11)";
  ctx.fillRect(px + 4, py + 4, CELL - 8, 5);
  ctx.restore();
}

/** Minimal playfield preview for the settings control-test board. */
export function createMiniBoardRenderer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): MiniBoardRenderer {
  const syncSize = (game: Game): void => {
    const playWidth = game.board.width * CELL + PADDING * 2;
    const playHeight = game.board.height * CELL + PADDING * 2;
    const parent = canvas.parentElement;
    const maxW = Math.max(1, (parent?.clientWidth ?? window.innerWidth) - 32);
    const maxH = Math.max(1, window.innerHeight * 0.42);
    const scale = Math.max(MIN_SCALE, Math.min(1, maxW / playWidth, maxH / playHeight));
    setCanvasSize(canvas, ctx, playWidth, playHeight, scale);
  };

  const draw = (game: Game): void => {
    const snap = game.getSnapshot();
    const layoutW = game.board.width * CELL;
    const layoutH = game.board.height * CELL;
    const bounds = getBoardBoundsFromLocked(snap.locked);

    const bg = ctx.createLinearGradient(0, 0, 0, layoutH + PADDING * 2);
    bg.addColorStop(0, "#2a2233");
    bg.addColorStop(0.55, "#39293e");
    bg.addColorStop(1, "#263546");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, layoutW + PADDING * 2, layoutH + PADDING * 2);

    ctx.save();
    ctx.translate(PADDING, PADDING);

    ctx.fillStyle = "rgba(17, 26, 42, 0.58)";
    ctx.fillRect(0, 0, layoutW, layoutH);
    ctx.fillStyle = "rgba(15, 23, 40, 0.78)";
    ctx.fillRect(snap.viewOffsetX * CELL, snap.viewOffsetY * CELL, snap.width * CELL, snap.height * CELL);

    for (let y = 0; y <= snap.height; y++) {
      ctx.strokeStyle = "rgba(214, 228, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(snap.viewOffsetX * CELL, snap.viewOffsetY * CELL + y * CELL);
      ctx.lineTo(snap.viewOffsetX * CELL + snap.width * CELL, snap.viewOffsetY * CELL + y * CELL);
      ctx.stroke();
    }
    for (let x = 0; x <= snap.width; x++) {
      ctx.strokeStyle = "rgba(214, 228, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(snap.viewOffsetX * CELL + x * CELL, snap.viewOffsetY * CELL);
      ctx.lineTo(snap.viewOffsetX * CELL + x * CELL, snap.viewOffsetY * CELL + snap.height * CELL);
      ctx.stroke();
    }

    const drawCell = (x: number, y: number, type: PieceType, alpha = 1, ghost = false): void => {
      drawStyledCell(ctx, x, y, PIECE_STYLES[type], alpha);
      if (ghost) {
        ctx.fillStyle = "rgba(7, 13, 22, 0.35)";
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      }
    };

    const drawLockedCell = (x: number, y: number, cell: BoardCell, alpha = 1): void => {
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

    ctx.translate(layoutW / 2, layoutH / 2);
    ctx.rotate((snap.boardRotation % 4) * (Math.PI / 2));
    ctx.translate(-layoutW / 2, -layoutH / 2);

    for (let y = 0; y < bounds.height; y++) {
      for (let x = 0; x < bounds.width; x++) {
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
          if (isWithinBoard(bounds, ghostCellX, ghostCellY)) {
            drawCell(ghostCellX, ghostCellY, p.type, 0.2, true);
          }
        }
      }
      for (const [rowIdx, row] of shape.entries()) {
        for (const [colIdx, cell] of row.entries()) {
          if (cell === 0) continue;
          const x = p.x + colIdx;
          const y = p.y + rowIdx;
          if (isWithinBoard(bounds, x, y)) {
            drawCell(x, y, p.type);
          }
        }
      }
    }

    ctx.restore();

    ctx.save();
    ctx.translate(PADDING, PADDING);
    ctx.fillStyle = "rgba(248, 232, 255, 0.72)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Control test — same keys as a run", snap.viewOffsetX * CELL, -6);
    ctx.restore();
  };

  return { syncSize, draw };
}
