import type { PieceType } from "@game/piece";
import { BOARD_CELL_SIZE } from "./boardCanvasLayout";
import { PIECE_STYLES } from "./pieceStyles";

const CELL = BOARD_CELL_SIZE;
const OBSTACLE_COLOR = "#6b7280";

function drawPieceCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: PieceType,
  alpha = 1,
): void {
  const style = PIECE_STYLES[type];
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

function drawSolidCell(ctx: CanvasRenderingContext2D, x: number, y: number, alpha = 1): void {
  const px = x * CELL;
  const py = y * CELL;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = OBSTACLE_COLOR;
  ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(px + 3, py + 3, CELL - 6, 6);
  ctx.restore();
}

export { drawPieceCell, drawSolidCell };
