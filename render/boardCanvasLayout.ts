import type { GameSnapshot } from "@game/game";
import { getBoardBoundsFromLocked } from "./playfieldCoords";

/** Must match renderer playfield sizing. */
const BOARD_CELL = 26;
const BOARD_PAD = 20;

/** Playfield local (lx, ly) top-left pixel → logical canvas coords, same transforms as renderer. */
function playfieldLocalToCanvasLogical(
  lx: number,
  ly: number,
  playW: number,
  playH: number,
  quarterTurns: number,
): { cx: number; cy: number } {
  const θ = quarterTurns * (Math.PI / 2);
  const boardX = BOARD_PAD;
  const boardY = BOARD_PAD;
  const ux = lx - playW / 2;
  const uy = ly - playH / 2;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  const xr = ux * cos + uy * sin;
  const yr = -ux * sin + uy * cos;
  return { cx: boardX + playW / 2 + xr, cy: boardY + playH / 2 + yr };
}

/** Visible playfield viewport (dark inner rect) extents on the canvas in logical px, after rotation. */
function viewportLogicalYRange(
  snap: Pick<GameSnapshot, "locked" | "viewOffsetX" | "viewOffsetY" | "width" | "height" | "boardRotation">,
): { minY: number; maxY: number } {
  const { width: fullWidth, height: fullHeight } = getBoardBoundsFromLocked(snap.locked);
  const playW = fullWidth * BOARD_CELL;
  const playH = fullHeight * BOARD_CELL;
  const vx = snap.viewOffsetX * BOARD_CELL;
  const vy = snap.viewOffsetY * BOARD_CELL;
  const vw = snap.width * BOARD_CELL;
  const vh = snap.height * BOARD_CELL;
  const quarters = snap.boardRotation % 4;

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const collect = (lx: number, ly: number): void => {
    const { cy } = playfieldLocalToCanvasLogical(lx, ly, playW, playH, quarters);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
  };

  collect(vx, vy);
  collect(vx + vw, vy);
  collect(vx + vw, vy + vh);
  collect(vx, vy + vh);

  return { minY, maxY };
}

function logicalCanvasHeightFromSnap(
  snap: Pick<GameSnapshot, "locked">,
): number {
  const bounds = getBoardBoundsFromLocked(snap.locked);
  return bounds.height * BOARD_CELL + BOARD_PAD * 2;
}

export { BOARD_CELL as BOARD_CELL_SIZE, BOARD_PAD as BOARD_PADDING, viewportLogicalYRange, logicalCanvasHeightFromSnap };
