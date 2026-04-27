import type { Piece } from "../piece";

const pieceLow = (piece: Piece, gravity: [number, number]): number => {
  const shape = piece.getShape(piece.rotation);
  const [gx, gy] = gravity;
  let low = Number.NEGATIVE_INFINITY;
  for (const [rowIdx, row] of shape.entries()) {
    for (const [colIdx, cell] of row.entries()) {
      if (cell === 0) continue;
      const x = piece.x + colIdx;
      const y = piece.y + rowIdx;
      low = Math.max(low, x * gx + y * gy);
    }
  }
  return low;
};

const syncLowProgress = (previousLow: number, nextLow: number): { low: number; reachedNewLow: boolean } => {
  if (previousLow === Number.NEGATIVE_INFINITY) return { low: nextLow, reachedNewLow: false };
  if (nextLow > previousLow) return { low: nextLow, reachedNewLow: true };
  return { low: previousLow, reachedNewLow: false };
};

export { pieceLow, syncLowProgress };
