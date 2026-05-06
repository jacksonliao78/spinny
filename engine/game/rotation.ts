import type { BoardCell, BoardModel } from "../board/types";
import type { PieceType } from "../piece";
import type { Piece } from "../piece";
import type { GameConfig } from "./rules";

export type SpinResult = {
  pieceType: PieceType;
  kind: "t-spin" | "all-spin";
};

export type LastRotation = {
  pieceType: PieceType;
  x: number;
  y: number;
  rotation: number;
  usedKick: boolean;
};

type VisibleBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const matchesLastRotation = (piece: Piece, lastRotation: LastRotation | null): boolean => {
  return (
    lastRotation !== null &&
    lastRotation.pieceType === piece.type &&
    lastRotation.x === piece.x &&
    lastRotation.y === piece.y &&
    lastRotation.rotation === piece.rotation
  );
};

const isSpinCornerBlocked = (
  x: number,
  y: number,
  locked: BoardCell[][],
  visibleBounds: VisibleBounds,
  board: BoardModel,
): boolean => {
  if (x < visibleBounds.minX || x > visibleBounds.maxX || y < visibleBounds.minY || y > visibleBounds.maxY) return true;
  if (x < 0 || x >= board.width || y < 0 || y >= board.height) return true;
  return locked[y][x] !== null;
};

const validTSpin = (piece: Piece, board: BoardModel, visibleBounds: VisibleBounds): boolean => {
  const centerX = piece.x + 1;
  const centerY = piece.y + 2;
  const locked = board.getLockedCopy();
  const corners = [
    [centerX - 1, centerY - 1],
    [centerX + 1, centerY - 1],
    [centerX - 1, centerY + 1],
    [centerX + 1, centerY + 1],
  ] as const;
  return corners.filter(([x, y]) => isSpinCornerBlocked(x, y, locked, visibleBounds, board)).length >= 3;
};

const isImmobile = (piece: Piece, board: BoardModel, canMovePiece: (piece: Piece, dx: number, dy: number) => boolean): boolean => {
  const [gx, gy] = board.gravityDelta();
  const [leftX, leftY] = board.lateralLeftDelta();
  const [rightX, rightY] = board.lateralRightDelta();
  return (
    !canMovePiece(piece, gx, gy) &&
    !canMovePiece(piece, leftX, leftY) &&
    !canMovePiece(piece, rightX, rightY)
  );
};

export const detectSpin = (args: {
  piece: Piece;
  lastRotation: LastRotation | null;
  config: GameConfig;
  board: BoardModel;
  visibleBounds: VisibleBounds;
  canMovePiece: (piece: Piece, dx: number, dy: number) => boolean;
}): SpinResult | null => {
  const { piece, lastRotation, config, board, visibleBounds, canMovePiece } = args;
  if (!matchesLastRotation(piece, lastRotation)) return null;
  if (piece.type === "T" && validTSpin(piece, board, visibleBounds)) {
    return { pieceType: piece.type, kind: "t-spin" };
  }
  if (config.modifiers.allSpins && piece.type !== "T" && lastRotation?.usedKick && isImmobile(piece, board, canMovePiece)) {
    return { pieceType: piece.type, kind: "all-spin" };
  }
  return null;
};

