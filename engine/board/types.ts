import type { PieceType, Piece } from "../piece";

type BoardCell = PieceType | null | 1;

type BoardModel = {
  width: number;
  height: number;
  rotation: number;
  rotate: () => void;
  gravityDelta: () => [number, number];
  lateralLeftDelta: () => [number, number];
  lateralRightDelta: () => [number, number];
  getLockedCopy: () => BoardCell[][];
  canPlace: (piece: Piece, rotation: number, dx: number, dy: number) => boolean;
  isBottomBordered: (piece: Piece) => boolean;
  lockPiece: (piece: Piece) => void;
  clearLines: () => number;
};

type BoardFactory = (width: number, height: number) => BoardModel;

export type { BoardCell, BoardModel, BoardFactory };
