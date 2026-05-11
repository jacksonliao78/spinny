import type { PieceType } from "@game/piece";
import { PIECE_ROTATIONS } from "@game/piece";
import { PIECE_STYLES } from "./pieceStyles";

const MINI_CELL = 10;
const HOLD_WIDTH = 4 * MINI_CELL + 8;
const HOLD_HEIGHT = 4 * MINI_CELL + 8;
const NEXT_SLOT_HEIGHT = 3 * MINI_CELL;
const NEXT_COUNT = 5;
const NEXT_GAP = 4;
const NEXT_WIDTH = 4 * MINI_CELL + 8;
const NEXT_HEIGHT = NEXT_COUNT * NEXT_SLOT_HEIGHT + (NEXT_COUNT - 1) * NEXT_GAP;

function setupMiniCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(logicalW * dpr);
  canvas.height = Math.floor(logicalH * dpr);
  canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  centerX: number,
  centerY: number,
  size = MINI_CELL,
): void {
  const shape = PIECE_ROTATIONS[type][0];
  let minX = 4;
  let minY = 4;
  let maxX = 0;
  let maxY = 0;
  for (let row = 0; row < shape.length; row += 1) {
    for (let col = 0; col < shape[row].length; col += 1) {
      if (shape[row][col] === 0) continue;
      minX = Math.min(minX, col);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, col);
      maxY = Math.max(maxY, row);
    }
  }

  const pieceW = (maxX - minX + 1) * size;
  const pieceH = (maxY - minY + 1) * size;
  const offsetX = centerX - pieceW / 2;
  const offsetY = centerY - pieceH / 2;
  const style = PIECE_STYLES[type];

  for (let row = 0; row < shape.length; row += 1) {
    for (let col = 0; col < shape[row].length; col += 1) {
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

function setupHoldCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return setupMiniCanvas(canvas, HOLD_WIDTH, HOLD_HEIGHT);
}

function setupNextCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return setupMiniCanvas(canvas, NEXT_WIDTH, NEXT_HEIGHT);
}

function drawHoldPiece(canvas: HTMLCanvasElement, type: PieceType | null): void {
  const ctx = setupHoldCanvas(canvas);
  ctx.clearRect(0, 0, HOLD_WIDTH, HOLD_HEIGHT);
  if (type) drawMiniPiece(ctx, type, HOLD_WIDTH / 2, HOLD_HEIGHT / 2);
}

function drawNextPieces(canvas: HTMLCanvasElement, next: PieceType[]): void {
  const ctx = setupNextCanvas(canvas);
  ctx.clearRect(0, 0, NEXT_WIDTH, NEXT_HEIGHT);
  next.slice(0, NEXT_COUNT).forEach((type, idx) => {
    const cy = NEXT_SLOT_HEIGHT / 2 + idx * (NEXT_SLOT_HEIGHT + NEXT_GAP);
    drawMiniPiece(ctx, type, NEXT_WIDTH / 2, cy);
  });
}

export {
  HOLD_HEIGHT,
  HOLD_WIDTH,
  MINI_CELL,
  NEXT_COUNT,
  NEXT_GAP,
  NEXT_HEIGHT,
  NEXT_SLOT_HEIGHT,
  NEXT_WIDTH,
  drawHoldPiece,
  drawMiniPiece,
  drawNextPieces,
  setupHoldCanvas,
  setupMiniCanvas,
  setupNextCanvas,
};
