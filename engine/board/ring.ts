import { PieceType, Piece } from "../piece";
import type { BoardModel } from "./types";

class RingBoard implements BoardModel {
  width: number;
  height: number;
  board: (PieceType | null | 1)[][];

  center: number;
  rotation: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.board = Array.from({ length: height }, () => Array<PieceType | null | 1>(width).fill(null));
    const centerStartX = Math.floor((width - 3) / 2);
    const centerStartY = Math.floor((height - 3) / 2);
    for (let y = centerStartY; y < centerStartY + 3; y++) {
      for (let x = centerStartX; x < centerStartX + 3; x++) {
        if (y >= 0 && y < height && x >= 0 && x < width) {
          this.board[y][x] = 1;
        }
      }
    }
    this.center = width / 2 - 1;

    this.rotation = 0;
  }

  /** Called after a piece locks; cycles which way gravity pulls in grid space. */
  rotate() {
    this.rotation = (this.rotation + 1) % 4;
  }

  /**
   * Gravity direction in grid coordinates (+y is downward on screen).
   * `rotation` 0→3: down, right, up, left.
   */
  gravityDelta(): [number, number] {
    switch (((this.rotation % 4) + 4) % 4) {
      case 0:
        return [0, 1];
      case 1:
        return [1, 0];
      case 2:
        return [0, -1];
      case 3:
        return [-1, 0];
      default:
        return [0, 1];
    }
  }

  /** Slide along the “floor” perpendicular to gravity (keyboard left). */
  lateralLeftDelta(): [number, number] {
    const [gx, gy] = this.gravityDelta();
    return [-gy, gx];
  }

  /** Slide along the “floor” perpendicular to gravity (keyboard right). */
  lateralRightDelta(): [number, number] {
    const [gx, gy] = this.gravityDelta();
    return [gy, -gx];
  }

  /** Copy of locked cells only (no active piece). */
  getLockedCopy(): (PieceType | null | 1)[][] {
    return this.board.map((row) => [...row]);
  }

  /**
   * Returns whether you can place a piece at a given rotation, with offsets dx and dy.
   */
  canPlace(piece: Piece, rotation: number, dx: number, dy: number): boolean {
    const curPiece = piece.get_shape(rotation);
    for (const [rowIdx, row] of curPiece.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const x = piece.x + colIdx + dx;
        const y = piece.y + rowIdx + dy;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        if (this.board[y][x] !== null) return false;
      }
    }
    return true;
  }

  /**
   * Returns whether you can move a piece by dx and dy.
   */
  canMove(piece: Piece, dx: number, dy: number): boolean {
    const curPiece = piece.get_shape(piece.rotation);
    for (const [rowIdx, row] of curPiece.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const x = piece.x + colIdx + dx;
        const y = piece.y + rowIdx + dy;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        if (this.board[y][x] !== null) return false;
      }
    }
    return true;
  }

  /**
   * Returns whether you can rotate a piece by some amount
   */
  canRotate(piece: Piece, rotations: number): boolean {
    const newRotation = (((piece.rotation + rotations) % 4) + 4) % 4;
    const curPiece = piece.get_shape(newRotation);

    for (const [rowIdx, row] of curPiece.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const x = piece.x + colIdx;
        const y = piece.y + rowIdx;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        if (this.board[y][x] !== null) return false;
      }
    }
    return true;
  }

  /**
   * Returns true when every gravity-facing bottom cell of the piece is border / empty cell supported.
   */
  isBottomBordered(piece: Piece): boolean {
    const curPiece = piece.get_shape(piece.rotation);
    const [gx, gy] = this.gravityDelta();

    let foundBottom = false;
    for (const [rowIdx, row] of curPiece.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;

        const nextRow = rowIdx + gy;
        const nextCol = colIdx + gx;
        const hasOwnBelow = nextRow >= 0 && nextRow < curPiece.length &&
          nextCol >= 0 && nextCol < curPiece[nextRow].length && curPiece[nextRow][nextCol] !== 0;
        if (hasOwnBelow) continue;

        const x = piece.x + colIdx;
        const y = piece.y + rowIdx;
        const belowX = x + gx;
        const belowY = y + gy;
        foundBottom = true;

        // in-bounds support keeps this piece in play
        if (belowX >= 0 && belowX < this.width && belowY >= 0 && belowY < this.height) {
          if (this.board[belowY][belowX] !== null) return false;
        }
      }
    }

    return foundBottom;
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

  /**
   * line clears
   */
  clearLines(): number {
    const minCenterX = Math.floor((this.width - 3) / 2);
    const minCenterY = Math.floor((this.height - 3) / 2);
    const maxCenterX = minCenterX + 2;
    const maxCenterY = minCenterY + 2;

    const ringDistance = (x: number, y: number): number => {
      const dx = x < minCenterX ? minCenterX - x : x > maxCenterX ? x - maxCenterX : 0;
      const dy = y < minCenterY ? minCenterY - y : y > maxCenterY ? y - maxCenterY : 0;
      return Math.max(dx, dy);
    };
    const stepTowardCenter = (x: number, y: number): [number, number] => {
      let nx = x;
      let ny = y;
      if (x < minCenterX) nx += 1;
      else if (x > maxCenterX) nx -= 1;
      if (y < minCenterY) ny += 1;
      else if (y > maxCenterY) ny -= 1;
      return [nx, ny];
    };
    const isRingCorner = (x: number, y: number, ring: number): boolean => {
      const left = minCenterX - ring;
      const right = maxCenterX + ring;
      const top = minCenterY - ring;
      const bottom = maxCenterY + ring;
      const onVerticalEdge = x === left || x === right;
      const onHorizontalEdge = y === top || y === bottom;
      return onVerticalEdge && onHorizontalEdge;
    };

    const maxRing = Math.max(
      minCenterX,
      minCenterY,
      this.width - 1 - maxCenterX,
      this.height - 1 - maxCenterY,
    );

    const clearedRings: number[] = [];
    for (let ring = 1; ring <= maxRing; ring++) {
      let hasCells = false;
      let full = true;
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (ringDistance(x, y) !== ring) continue;
          hasCells = true;
          if (this.board[y][x] === null) {
            full = false;
            break;
          }
        }
        if (!full) break;
      }
      if (hasCells && full) clearedRings.push(ring);
    }

    if (clearedRings.length === 0) return 0;

    const source = this.getLockedCopy();
    const isCleared = new Set(clearedRings);
    const countClearedInside = (ring: number): number => {
      let n = 0;
      for (const r of clearedRings) {
        if (r < ring) n += 1;
      }
      return n;
    };
    const stepTowardCenterTimes = (x: number, y: number, steps: number): [number, number] => {
      let nx = x;
      let ny = y;
      for (let i = 0; i < steps; i++) {
        [nx, ny] = stepTowardCenter(nx, ny);
      }
      return [nx, ny];
    };

    const nextBoard = Array.from(
      { length: this.height },
      () => Array<PieceType | null | 1>(this.width).fill(null),
    );
    for (let y = minCenterY; y <= maxCenterY; y++) {
      for (let x = minCenterX; x <= maxCenterX; x++) {
        nextBoard[y][x] = 1;
      }
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = source[y][x];
        if (cell === null || cell === 1) continue;

        const ring = ringDistance(x, y);
        if (isCleared.has(ring)) continue;

        const shift = countClearedInside(ring);
        if (shift > 0 && isRingCorner(x, y, ring)) continue;

        const [nx, ny] = stepTowardCenterTimes(x, y, shift);
        if (nextBoard[ny][nx] === null) nextBoard[ny][nx] = cell;
      }
    }

    this.board = nextBoard;
    return clearedRings.length;
  }
}

export { RingBoard };
