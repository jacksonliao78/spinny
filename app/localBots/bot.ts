import type { Game, GameSnapshot } from "@game/game";
import { Piece } from "@game/piece";
import type { BoardCell } from "@game/board/types";

type BotPlacement = {
  x: number;
  y: number;
  rotation: number;
  score: number;
};

type BotController = {
  update: (game: Game, dtMs: number) => void;
};

const ACTION_INTERVAL_MS = 80;

const occupiedCellsFor = (piece: Piece): Array<[number, number]> => {
  const cells: Array<[number, number]> = [];
  const shape = piece.getShape(piece.rotation);
  for (const [rowIdx, row] of shape.entries()) {
    for (const [colIdx, occupied] of row.entries()) {
      if (occupied) cells.push([piece.x + colIdx, piece.y + rowIdx]);
    }
  }
  return cells;
};

const cloneLocked = (locked: BoardCell[][]): BoardCell[][] => locked.map((row) => [...row]);

const simulateLockedBoard = (snap: GameSnapshot, piece: Piece): BoardCell[][] => {
  const grid = cloneLocked(snap.locked);
  for (const [x, y] of occupiedCellsFor(piece)) {
    if (y < 0 || y >= grid.length || x < 0 || x >= (grid[0]?.length ?? 0)) continue;
    grid[y][x] = piece.type;
  }
  return grid.filter((row) => !row.every((cell) => cell !== null));
};

const columnStats = (grid: BoardCell[][], snap: GameSnapshot): { heights: number[]; holes: number } => {
  const heights: number[] = [];
  let holes = 0;
  const fullHeight = grid.length;
  for (let x = snap.viewOffsetX; x < snap.viewOffsetX + snap.width; x += 1) {
    let seenBlock = false;
    let height = 0;
    for (let y = snap.viewOffsetY; y < grid.length; y += 1) {
      const filled = grid[y]?.[x] !== null;
      if (filled && !seenBlock) {
        seenBlock = true;
        height = fullHeight - y;
      } else if (!filled && seenBlock) {
        holes += 1;
      }
    }
    heights.push(height);
  }
  return { heights, holes };
};

const scorePlacement = (snap: GameSnapshot, piece: Piece): number => {
  const beforeRows = snap.locked.length;
  const grid = simulateLockedBoard(snap, piece);
  const lines = beforeRows - grid.length;
  const { heights, holes } = columnStats(grid, snap);
  const aggregateHeight = heights.reduce((sum, height) => sum + height, 0);
  const maxHeight = Math.max(0, ...heights);
  const bumpiness = heights.slice(1).reduce((sum, height, index) => sum + Math.abs(height - heights[index]), 0);
  return lines * 220 - holes * 55 - aggregateHeight * 4 - maxHeight * 8 - bumpiness * 2;
};

const enumerateLegalPlacements = (game: Game): BotPlacement[] => {
  const snap = game.getSnapshot();
  if (!snap.active || snap.gameOver) return [];
  const placements: BotPlacement[] = [];
  const fullWidth = snap.locked[0]?.length ?? snap.width;
  const [gx, gy] = game.board.gravityDelta();
  const minX = -3;
  const maxX = fullWidth + 2;

  for (let rotation = 0; rotation < 4; rotation += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const piece = new Piece(snap.active.type, x, snap.active.y);
      piece.rotation = rotation;
      if (!game.canMovePiece(piece, 0, 0)) continue;
      while (game.canMovePiece(piece, gx, gy)) piece.move(gx, gy);
      placements.push({ x: piece.x, y: piece.y, rotation, score: scorePlacement(snap, piece) });
    }
  }

  placements.sort((a, b) => b.score - a.score || b.y - a.y || a.x - b.x || a.rotation - b.rotation);
  return placements;
};

const chooseBotPlacement = (game: Game): BotPlacement | null => enumerateLegalPlacements(game)[0] ?? null;

const activeMatchesPlacement = (snap: GameSnapshot, placement: BotPlacement): boolean =>
  Boolean(snap.active && snap.active.x === placement.x && snap.active.y === placement.y && snap.active.rotation === placement.rotation);

const stepTowardPlacement = (game: Game, placement: BotPlacement): void => {
  const snap = game.getSnapshot();
  const active = snap.active;
  if (!active || snap.gameOver) return;

  if (active.rotation !== placement.rotation) {
    game.rotateCw();
    return;
  }

  if (active.x !== placement.x || active.y !== placement.y) {
    if (active.x < placement.x) game.moveRight();
    else if (active.x > placement.x) game.moveLeft();
    else if (active.y < placement.y) game.moveRight();
    else game.moveLeft();
    return;
  }

  game.hardDrop();
};

const createBotController = (): BotController => {
  let actionMs = 0;
  let plannedPiece: Piece | null = null;
  let placement: BotPlacement | null = null;

  return {
    update: (game, dtMs) => {
      actionMs += dtMs;
      if (actionMs < ACTION_INTERVAL_MS) return;
      actionMs = 0;
      const snap = game.getSnapshot();
      if (!snap.active || snap.gameOver) return;
      if (plannedPiece !== snap.active || !placement) {
        plannedPiece = snap.active;
        placement = chooseBotPlacement(game);
      }
      if (!placement) return;
      stepTowardPlacement(game, placement);
      const nextSnap = game.getSnapshot();
      if (nextSnap.active !== plannedPiece || activeMatchesPlacement(nextSnap, placement)) {
        placement = nextSnap.active === plannedPiece ? placement : null;
      }
    },
  };
};

export { chooseBotPlacement, createBotController, enumerateLegalPlacements, scorePlacement };
export type { BotController, BotPlacement };
