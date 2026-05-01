type BoardBounds = {
  width: number;
  height: number;
};

function getBoardBoundsFromLocked(locked: readonly (readonly unknown[])[]): BoardBounds {
  return {
    height: locked.length,
    width: locked[0]?.length ?? 0,
  };
}

function isWithinBoard(bounds: BoardBounds, x: number, y: number): boolean {
  return y >= 0 && y < bounds.height && x >= 0 && x < bounds.width;
}

export { getBoardBoundsFromLocked, isWithinBoard };
export type { BoardBounds };
