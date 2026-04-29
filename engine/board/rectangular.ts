import type { Piece } from "../piece";
import { SOLID_CELL } from "./types";
import type { BoardCell, BoardModel } from "./types";

const SPAWN_PAD = 2;

/** Standard rectangular board with fixed downward gravity and horizontal row clears. */
class RectangularBoard implements BoardModel {
  width: number;
  height: number;
  board: BoardCell[][];
  rotation: number;
  private garbageHoleCursor = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.board = Array.from({ length: height }, () => Array<BoardCell>(width).fill(null));
    this.rotation = 0;
  }

  rotate(): void {
    // Rectangular boards do not rotate after locks.
  }

  gravityDelta(): [number, number] {
    return [0, 1];
  }

  lateralLeftDelta(): [number, number] {
    return [-1, 0];
  }

  lateralRightDelta(): [number, number] {
    return [1, 0];
  }

  getLockedCopy(): BoardCell[][] {
    return this.board.map((row) => [...row]);
  }

  canPlace(piece: Piece, rotation: number, offsetX: number, offsetY: number): boolean {
    const shape = piece.get_shape(rotation);
    for (const [rowIdx, row] of shape.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const x = piece.x + colIdx + offsetX;
        const y = piece.y + rowIdx + offsetY;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        if (this.board[y][x] !== null) return false;
      }
    }
    return true;
  }

  isContactLoss(_piece: Piece): boolean {
    return false;
  }

  lockPiece(piece: Piece): void {
    const shape = piece.get_shape(piece.rotation);
    for (const [rowIdx, row] of shape.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const x = piece.x + colIdx;
        const y = piece.y + rowIdx;
        this.board[y][x] = piece.type;
      }
    }
  }

  clearLines(): number {
    const { minX, maxX, maxY } = this.getPlayBounds();
    const clearedRows = new Set<number>();
    for (let y = SPAWN_PAD; y <= maxY; y++) {
      let full = true;
      for (let x = minX; x <= maxX; x++) {
        if (this.board[y][x] === null) {
          full = false;
          break;
        }
      }
      if (full) clearedRows.add(y);
    }
    if (clearedRows.size === 0) return 0;

    const next = this.getLockedCopy();
    for (let y = 0; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) next[y][x] = null;
    }

    let writeY = maxY;
    for (let y = maxY; y >= 0; y--) {
      if (clearedRows.has(y)) continue;
      for (let x = minX; x <= maxX; x++) next[writeY][x] = this.board[y][x];
      writeY -= 1;
    }

    this.board = next;
    return clearedRows.size;
  }

  addGarbage(lines: number, holesPerLine: number): number {
    const amount = Math.max(0, Math.floor(lines));
    if (amount === 0) return 0;

    let applied = 0;
    for (let i = 0; i < amount; i++) {
      this.pushGarbageLine(holesPerLine);
      applied += 1;
    }
    return applied;
  }

  private getPlayBounds() {
    return {
      minX: SPAWN_PAD,
      maxX: this.width - SPAWN_PAD - 1,
      maxY: this.height - SPAWN_PAD - 1,
    };
  }

  private pushGarbageLine(holesPerLine: number): void {
    const { minX, maxX, maxY } = this.getPlayBounds();
    for (let y = 0; y < maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        this.board[y][x] = this.board[y + 1][x];
      }
    }

    const width = maxX - minX + 1;
    const holes = this.pickGarbageHoles(width, holesPerLine);
    for (let x = minX; x <= maxX; x++) {
      this.board[maxY][x] = holes.has(x - minX) ? null : SOLID_CELL;
    }
  }

  private pickGarbageHoles(cellCount: number, holesPerLine: number): Set<number> {
    const holeCount = Math.min(Math.max(1, Math.floor(holesPerLine)), cellCount);
    const holes = new Set<number>();
    const step = Math.max(1, Math.floor(cellCount / holeCount));
    for (let i = 0; holes.size < holeCount; i++) {
      holes.add((this.garbageHoleCursor + i * step) % cellCount);
    }
    this.garbageHoleCursor = (this.garbageHoleCursor + 1) % cellCount;
    return holes;
  }
}

export { RectangularBoard };
