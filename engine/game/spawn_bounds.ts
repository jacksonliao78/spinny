import type { Piece } from "../piece";

type VisibleBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const getSpawnCoords = (
  playWidth: number,
  playHeight: number,
  spawnPad: number,
  rotation: number,
): { x: number; y: number } => {
  const r = ((rotation % 4) + 4) % 4;
  switch (r) {
    case 0:
      return { x: spawnPad + Math.floor(playWidth / 2) - 2, y: spawnPad - 2 };
    case 1:
      return { x: spawnPad - 2, y: spawnPad + Math.floor(playHeight / 2) - 2 };
    case 2:
      return { x: spawnPad + Math.floor(playWidth / 2) - 2, y: spawnPad + playHeight - 2 };
    case 3:
      return { x: spawnPad + playWidth - 2, y: spawnPad + Math.floor(playHeight / 2) - 2 };
    default:
      return { x: spawnPad + Math.floor(playWidth / 2) - 2, y: spawnPad - 2 };
  }
};

const getVisibleBounds = (playWidth: number, playHeight: number, spawnPad: number): VisibleBounds => ({
  minX: spawnPad,
  maxX: spawnPad + playWidth - 1,
  minY: spawnPad,
  maxY: spawnPad + playHeight - 1,
});

const respectsViewBounds = (
  piece: Piece,
  rotation: number,
  x: number,
  y: number,
  bounds: VisibleBounds,
  boardRotation: number,
): boolean => {
  const shape = piece.getShape(rotation);
  const r = ((boardRotation % 4) + 4) % 4;

  for (const [rowIdx, row] of shape.entries()) {
    for (const [colIdx, cell] of row.entries()) {
      if (cell === 0) continue;
      const px = x + colIdx;
      const py = y + rowIdx;
      switch (r) {
        case 0:
          if (px < bounds.minX || px > bounds.maxX || py > bounds.maxY) return false;
          break;
        case 1:
          if (py < bounds.minY || py > bounds.maxY || px > bounds.maxX) return false;
          break;
        case 2:
          if (px < bounds.minX || px > bounds.maxX || py < bounds.minY) return false;
          break;
        case 3:
          if (py < bounds.minY || py > bounds.maxY || px < bounds.minX) return false;
          break;
        default:
          if (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY) return false;
          break;
      }
    }
  }
  return true;
};

export { getSpawnCoords, getVisibleBounds, respectsViewBounds };
export type { VisibleBounds };
