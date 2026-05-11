import type { MultiplayerCell, MultiplayerSnapshotPayload } from "../app/multiplayer/snapshots";
import { BOARD_CELL_SIZE, BOARD_PADDING } from "./boardCanvasLayout";
import { drawPieceCell, drawSolidCell } from "./boardCellPainter";

type RemoteBoardFrame = Pick<
  MultiplayerSnapshotPayload,
  "width" | "height" | "fullWidth" | "fullHeight" | "viewOffsetX" | "viewOffsetY"
> & {
  cells: MultiplayerCell[];
};

type RemoteBoardRenderer = {
  sync: (frame: RemoteBoardFrame, mirrorCanvas: HTMLCanvasElement) => void;
  draw: (frame: RemoteBoardFrame) => void;
  reset: () => void;
};

function setCanvasSize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number,
  mirrorCanvas: HTMLCanvasElement,
): void {
  const dpr = window.devicePixelRatio || 1;
  const mirrorWidth = mirrorCanvas.style.width;
  const mirrorHeight = mirrorCanvas.style.height;
  canvas.style.width = mirrorWidth || `${logicalWidth}px`;
  canvas.style.height = mirrorHeight || `${logicalHeight}px`;
  canvas.width = Math.floor(logicalWidth * dpr);
  canvas.height = Math.floor(logicalHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function createRemoteBoardRenderer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): RemoteBoardRenderer {
  let logicalWidth = 0;
  let logicalHeight = 0;

  const sync = (frame: RemoteBoardFrame, mirrorCanvas: HTMLCanvasElement): void => {
    logicalWidth = frame.fullWidth * BOARD_CELL_SIZE + BOARD_PADDING * 2;
    logicalHeight = frame.fullHeight * BOARD_CELL_SIZE + BOARD_PADDING * 2;
    setCanvasSize(canvas, ctx, logicalWidth, logicalHeight, mirrorCanvas);
  };

  const drawShell = (frame: RemoteBoardFrame): void => {
    const playWidth = frame.fullWidth * BOARD_CELL_SIZE;
    const playHeight = frame.fullHeight * BOARD_CELL_SIZE;
    const viewX = frame.viewOffsetX * BOARD_CELL_SIZE;
    const viewY = frame.viewOffsetY * BOARD_CELL_SIZE;
    const viewW = frame.width * BOARD_CELL_SIZE;
    const viewH = frame.height * BOARD_CELL_SIZE;

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    ctx.save();
    ctx.translate(BOARD_PADDING, BOARD_PADDING);
    ctx.fillStyle = "rgba(17, 26, 42, 0.58)";
    ctx.fillRect(0, 0, playWidth, playHeight);
    ctx.fillStyle = "rgba(15, 23, 40, 0.78)";
    ctx.fillRect(viewX, viewY, viewW, viewH);

    ctx.strokeStyle = "rgba(214, 228, 255, 0.08)";
    for (let y = 0; y <= frame.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(viewX, viewY + y * BOARD_CELL_SIZE);
      ctx.lineTo(viewX + viewW, viewY + y * BOARD_CELL_SIZE);
      ctx.stroke();
    }
    for (let x = 0; x <= frame.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(viewX + x * BOARD_CELL_SIZE, viewY);
      ctx.lineTo(viewX + x * BOARD_CELL_SIZE, viewY + viewH);
      ctx.stroke();
    }
  };

  const draw = (frame: RemoteBoardFrame): void => {
    drawShell(frame);
    for (const cell of frame.cells) {
      const x = frame.viewOffsetX + cell.x;
      const y = frame.viewOffsetY + cell.y;
      if (cell.value === "solid") {
        drawSolidCell(ctx, x, y);
      } else {
        drawPieceCell(ctx, x, y, cell.value);
      }
    }
    ctx.restore();
  };

  const reset = (): void => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.removeAttribute("style");
    logicalWidth = 0;
    logicalHeight = 0;
  };

  return { sync, draw, reset };
}

export { createRemoteBoardRenderer };
export type { RemoteBoardFrame, RemoteBoardRenderer };
