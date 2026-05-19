import type { Game, GameSnapshot } from "@game/game";
import { Piece } from "@game/piece";
import type { BoardCell } from "@game/board/types";

type BotPlacement = {
  x: number;
  y: number;
  rotation: number;
  score: number;
};

type BotClearModel = "rectangular" | "ring";

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

const placePieceOnGrid = (snap: GameSnapshot, piece: Piece): BoardCell[][] => {
  const grid = cloneLocked(snap.locked);
  for (const [x, y] of occupiedCellsFor(piece)) {
    if (y < 0 || y >= grid.length || x < 0 || x >= (grid[0]?.length ?? 0)) continue;
    grid[y][x] = piece.type;
  }
  return grid;
};

const rectangularClears = (grid: BoardCell[][], snap: GameSnapshot): number => {
  const minX = snap.viewOffsetX;
  const maxX = snap.viewOffsetX + snap.width - 1;
  let clears = 0;
  for (let y = snap.viewOffsetY; y < grid.length; y += 1) {
    let full = true;
    for (let x = minX; x <= maxX; x += 1) {
      if (grid[y]?.[x] === null) {
        full = false;
        break;
      }
    }
    if (full) clears += 1;
  }
  return clears;
};

const ringClears = (grid: BoardCell[][]): number => {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width === 0 || height === 0) return 0;
  const minCenterX = Math.floor((width - 3) / 2);
  const minCenterY = Math.floor((height - 3) / 2);
  const maxCenterX = minCenterX + 2;
  const maxCenterY = minCenterY + 2;
  const maxRing = Math.max(minCenterX, minCenterY, width - 1 - maxCenterX, height - 1 - maxCenterY);
  const ringDistance = (x: number, y: number): number => {
    const dx = x < minCenterX ? minCenterX - x : x > maxCenterX ? x - maxCenterX : 0;
    const dy = y < minCenterY ? minCenterY - y : y > maxCenterY ? y - maxCenterY : 0;
    return Math.max(dx, dy);
  };

  let clears = 0;
  for (let ring = 1; ring <= maxRing; ring += 1) {
    let hasCells = false;
    let full = true;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (ringDistance(x, y) !== ring) continue;
        hasCells = true;
        if (grid[y][x] === null) full = false;
      }
    }
    if (hasCells && full) clears += 1;
  }
  return clears;
};

const compactRectangularGrid = (grid: BoardCell[][], snap: GameSnapshot): BoardCell[][] => {
  const minX = snap.viewOffsetX;
  const maxX = snap.viewOffsetX + snap.width - 1;
  return grid.filter((row, y) => {
    if (y < snap.viewOffsetY) return true;
    for (let x = minX; x <= maxX; x += 1) {
      if (row[x] === null) return true;
    }
    return false;
  });
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

const scorePlacement = (snap: GameSnapshot, piece: Piece, clearModel: BotClearModel = "rectangular"): number => {
  const placedGrid = placePieceOnGrid(snap, piece);
  const lines = clearModel === "ring" ? ringClears(placedGrid) : rectangularClears(placedGrid, snap);
  const grid = clearModel === "ring" ? placedGrid : compactRectangularGrid(placedGrid, snap);
  const { heights, holes } = columnStats(grid, snap);
  const aggregateHeight = heights.reduce((sum, height) => sum + height, 0);
  const maxHeight = Math.max(0, ...heights);
  const bumpiness = heights.slice(1).reduce((sum, height, index) => sum + Math.abs(height - heights[index]), 0);
  return lines * 220 - holes * 55 - aggregateHeight * 4 - maxHeight * 8 - bumpiness * 2;
};

const enumerateLegalPlacements = (game: Game, clearModel: BotClearModel = "rectangular"): BotPlacement[] => {
  const snap = game.getSnapshot();
  if (!snap.active || snap.gameOver) return [];
  const placements: BotPlacement[] = [];
  const fullWidth = snap.locked[0]?.length ?? snap.width;
  const [gx, gy] = game.board.gravityDelta();
  const [rightX, rightY] = game.board.lateralRightDelta();
  const maxLanes = fullWidth + snap.locked.length + 4;

  for (let rotation = 0; rotation < 4; rotation += 1) {
    for (let lane = -maxLanes; lane <= maxLanes; lane += 1) {
      const piece = new Piece(snap.active.type, snap.active.x + rightX * lane, snap.active.y + rightY * lane);
      piece.rotation = rotation;
      if (!game.canMovePiece(piece, 0, 0)) continue;
      while (game.canMovePiece(piece, gx, gy)) piece.move(gx, gy);
      placements.push({ x: piece.x, y: piece.y, rotation, score: scorePlacement(snap, piece, clearModel) });
    }
  }

  placements.sort((a, b) => b.score - a.score || b.y - a.y || a.x - b.x || a.rotation - b.rotation);
  return placements;
};

const chooseBotPlacement = (game: Game, clearModel: BotClearModel = "rectangular"): BotPlacement | null =>
  enumerateLegalPlacements(game, clearModel)[0] ?? null;

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

  const [rightX, rightY] = game.board.lateralRightDelta();
  const lateralDistance = (placement.x - active.x) * rightX + (placement.y - active.y) * rightY;
  if (lateralDistance !== 0) {
    if (lateralDistance > 0) game.moveRight();
    else game.moveLeft();
    return;
  }

  game.hardDrop();
};

const createBotController = (clearModel: BotClearModel = "rectangular"): BotController => {
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
        placement = chooseBotPlacement(game, clearModel);
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
export type { BotClearModel, BotController, BotPlacement };
