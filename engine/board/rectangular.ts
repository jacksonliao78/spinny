import type { Piece, PieceType } from "../piece";
import type { BoardCell, BoardModel } from "./types";

/** Placeholder for a standard rectangular board; method contracts are defined by BoardModel. */
class RectangularBoard implements BoardModel {
  width: number;
  height: number;
  board: BoardCell[][];
  rotation: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.board = Array.from({ length: height }, () => Array<BoardCell>(width).fill(null));
    this.rotation = 0;
  }

  rotate(): void {
    //does nothing since it's a regular board
  }

  gravityDelta(): [number, number] {
    throw new Error("todo");
  }

  lateralLeftDelta(): [number, number] {
    throw new Error("todo");
  }

  lateralRightDelta(): [number, number] {
    throw new Error("todo");
  }

  getLockedCopy(): BoardCell[][] {
    throw new Error("todo");
  }

  canPlace(_piece: Piece, _rotation: number, _offsetX: number, _offsetY: number): boolean {
    throw new Error("todo");
  }

  isBottomBordered(_piece: Piece): boolean {
    throw new Error("todo");
  }

  lockPiece(_piece: Piece): void {
    throw new Error("todo");
  }

  clearLines(): number {
    throw new Error("todo");
  }

  addGarbage(_rings: number, _holesPerRing: number): number {
    throw new Error("todo");
  }
}

export { RectangularBoard };


