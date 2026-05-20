import type { Game, GameSnapshot } from "@game/game";
import { getAttackLines } from "@game/game/attack";
import type { SpinResult } from "@game/game/rotation";
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
const ATTACK_WEIGHT = 170;
const LOOKAHEAD_WEIGHT = 0.35;

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
  const maxY = snap.viewOffsetY + snap.height - 1;
  let clears = 0;
  for (let y = snap.viewOffsetY; y <= maxY; y += 1) {
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

const compactRectangularGrid = (grid: BoardCell[][], snap: GameSnapshot): BoardCell[][] => {
  const minX = snap.viewOffsetX;
  const maxX = snap.viewOffsetX + snap.width - 1;
  const maxY = snap.viewOffsetY + snap.height - 1;
  const next = cloneLocked(grid);
  const keptRows: BoardCell[][] = [];

  for (let y = snap.viewOffsetY; y <= maxY; y += 1) {
    const row = grid[y];
    let full = true;
    for (let x = minX; x <= maxX; x += 1) {
      if (row?.[x] === null) {
        full = false;
        break;
      }
    }
    if (!full) keptRows.push(row);
  }

  const emptyRows = Array.from({ length: snap.height - keptRows.length }, () => {
    const row = Array<BoardCell>(grid[0]?.length ?? snap.width).fill(null);
    return row;
  });
  const visibleRows = [...emptyRows, ...keptRows];
  for (let i = 0; i < visibleRows.length; i += 1) {
    for (let x = minX; x <= maxX; x += 1) next[snap.viewOffsetY + i][x] = visibleRows[i][x] ?? null;
  }

  return next;
};

const columnStats = (grid: BoardCell[][], snap: GameSnapshot): { heights: number[]; holes: number } => {
  const heights: number[] = [];
  let holes = 0;
  const maxY = snap.viewOffsetY + snap.height - 1;
  for (let x = snap.viewOffsetX; x < snap.viewOffsetX + snap.width; x += 1) {
    let seenBlock = false;
    let height = 0;
    for (let y = snap.viewOffsetY; y <= maxY; y += 1) {
      const filled = grid[y]?.[x] !== null;
      if (filled && !seenBlock) {
        seenBlock = true;
        height = maxY - y + 1;
      } else if (!filled && seenBlock) {
        holes += 1;
      }
    }
    heights.push(height);
  }
  return { heights, holes };
};

const occupiedCenterDistance = (piece: Piece, snap: GameSnapshot): number => {
  const cells = occupiedCellsFor(piece);
  if (cells.length === 0) return 0;
  const pieceCenter = cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
  const boardCenter = snap.viewOffsetX + (snap.width - 1) / 2;
  return Math.abs(pieceCenter - boardCenter);
};

const isBlockedForSpin = (snap: GameSnapshot, locked: BoardCell[][], x: number, y: number): boolean => {
  const minX = snap.viewOffsetX;
  const maxX = snap.viewOffsetX + snap.width - 1;
  const minY = snap.viewOffsetY;
  const maxY = snap.viewOffsetY + snap.height - 1;
  if (x < minX || x > maxX || y < minY || y > maxY) return true;
  return locked[y]?.[x] !== null;
};

const detectTSpinCandidate = (snap: GameSnapshot, piece: Piece): SpinResult | null => {
  if (piece.type !== "T") return null;
  const centerX = piece.x + 1;
  const centerY = piece.y + 2;
  const corners = [
    [centerX - 1, centerY - 1],
    [centerX + 1, centerY - 1],
    [centerX - 1, centerY + 1],
    [centerX + 1, centerY + 1],
  ] as const;
  const blocked = corners.filter(([x, y]) => isBlockedForSpin(snap, snap.locked, x, y)).length;
  return blocked >= 3 ? { pieceType: "T", kind: "t-spin" } : null;
};

const lineClearValue = (lines: number): number => {
  switch (lines) {
    case 1:
      return 90;
    case 2:
      return 260;
    case 3:
      return 520;
    default:
      return lines >= 4 ? 1_200 : 0;
  }
};

const scoreImmediatePlacement = (snap: GameSnapshot, piece: Piece): number => {
  const placedGrid = placePieceOnGrid(snap, piece);
  const lines = rectangularClears(placedGrid, snap);
  const grid = compactRectangularGrid(placedGrid, snap);
  const { heights, holes } = columnStats(grid, snap);
  const aggregateHeight = heights.reduce((sum, height) => sum + height, 0);
  const maxHeight = Math.max(0, ...heights);
  const bumpiness = heights.slice(1).reduce((sum, height, index) => sum + Math.abs(height - heights[index]), 0);
  const centerDistance = occupiedCenterDistance(piece, snap);
  const spin = detectTSpinCandidate(snap, piece);
  const attack = getAttackLines({
    linesCleared: lines,
    spin,
    combo: snap.combo ?? 0,
    backToBackChain: snap.b2b ?? 0,
  });
  const spinSetupBonus = spin && lines === 0 ? 90 : 0;
  return (
    lineClearValue(lines) +
    attack * ATTACK_WEIGHT +
    spinSetupBonus -
    holes * 55 -
    aggregateHeight * 4 -
    maxHeight * 8 -
    bumpiness * 2 -
    centerDistance
  );
};

const canPlaceOnGrid = (snap: GameSnapshot, grid: BoardCell[][], piece: Piece): boolean => {
  const minX = snap.viewOffsetX;
  const maxX = snap.viewOffsetX + snap.width - 1;
  const maxY = snap.viewOffsetY + snap.height - 1;
  for (const [x, y] of occupiedCellsFor(piece)) {
    if (x < minX || x > maxX || y > maxY || y < 0) return false;
    if (y >= snap.viewOffsetY && grid[y]?.[x] !== null) return false;
  }
  return true;
};

const snapshotAfterPlacement = (snap: GameSnapshot, piece: Piece): GameSnapshot => {
  const placedGrid = placePieceOnGrid(snap, piece);
  const lines = rectangularClears(placedGrid, snap);
  const spin = detectTSpinCandidate(snap, piece);
  const b2bQualified = lines > 0 && (lines >= 4 || spin?.kind === "t-spin");
  return {
    ...snap,
    locked: compactRectangularGrid(placedGrid, snap),
    active: null,
    combo: lines > 0 ? snap.combo + 1 : 0,
    b2b: b2bQualified ? snap.b2b + 1 : lines > 0 ? 0 : snap.b2b,
    linesClearedTotal: snap.linesClearedTotal + lines,
    piecesPlaced: snap.piecesPlaced + 1,
  };
};

const enumerateSnapshotPlacements = (snap: GameSnapshot, type: NonNullable<GameSnapshot["active"]>["type"]): Piece[] => {
  const placements: Piece[] = [];
  const seen = new Set<string>();
  const minX = snap.viewOffsetX - 3;
  const maxX = snap.viewOffsetX + snap.width;
  const spawnY = snap.viewOffsetY - 2;

  for (let rotation = 0; rotation < 4; rotation += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const piece = new Piece(type, x, spawnY);
      piece.rotation = rotation;
      if (!canPlaceOnGrid(snap, snap.locked, piece)) continue;
      while (true) {
        const next = new Piece(piece.type, piece.x, piece.y + 1);
        next.rotation = piece.rotation;
        if (!canPlaceOnGrid(snap, snap.locked, next)) break;
        piece.move(0, 1);
      }
      const key = `${piece.x},${piece.y},${piece.rotation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      placements.push(piece);
    }
  }

  return placements;
};

const bestLookaheadScore = (snap: GameSnapshot, piece: Piece): number => {
  const nextType = snap.next[0];
  if (!nextType) return 0;
  const nextSnap = snapshotAfterPlacement(snap, piece);
  const placements = enumerateSnapshotPlacements(nextSnap, nextType);
  if (placements.length === 0) return -400;
  return Math.max(...placements.map((placement) => scoreImmediatePlacement(nextSnap, placement)));
};

const scorePlacement = (snap: GameSnapshot, piece: Piece): number => {
  return scoreImmediatePlacement(snap, piece);
};

const enumerateLegalPlacements = (game: Game): BotPlacement[] => {
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
      const score = scorePlacement(snap, piece) + bestLookaheadScore(snap, piece) * LOOKAHEAD_WEIGHT;
      placements.push({ x: piece.x, y: piece.y, rotation, score });
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

  const [rightX, rightY] = game.board.lateralRightDelta();
  const lateralDistance = (placement.x - active.x) * rightX + (placement.y - active.y) * rightY;
  if (lateralDistance !== 0) {
    if (lateralDistance > 0) game.moveRight();
    else game.moveLeft();
    return;
  }

  if (active.rotation !== placement.rotation) {
    game.rotateCw();
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
