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
    const maxRing = Math.max(minCenterX, minCenterY, this.width - 1 - maxCenterX, this.height - 1 - maxCenterY);
    const ringCells: [number, number][][] = Array.from({ length: maxRing + 1 }, () => []);
    const ringDistance = (x: number, y: number) => {
      const dx = x < minCenterX ? minCenterX - x : x > maxCenterX ? x - maxCenterX : 0;
      const dy = y < minCenterY ? minCenterY - y : y > maxCenterY ? y - maxCenterY : 0;
      return Math.max(dx, dy);
    };
    const stepTowardCenter = (x: number, y: number): [number, number] => [
      x < minCenterX ? x + 1 : x > maxCenterX ? x - 1 : x,
      y < minCenterY ? y + 1 : y > maxCenterY ? y - 1 : y,
    ];
    const makeBaseBoard = () => {
      const out = Array.from({ length: this.height }, () => Array<PieceType | null | 1>(this.width).fill(null));
      for (let y = minCenterY; y <= maxCenterY; y++) {
        for (let x = minCenterX; x <= maxCenterX; x++) out[y][x] = 1;
      }
      return out;
    };

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) ringCells[ringDistance(x, y)].push([x, y]);
    }

    const clearedRings = new Set<number>();
    for (let ring = 1; ring <= maxRing; ring++) {
      if (ringCells[ring].length > 0 && ringCells[ring].every(([x, y]) => this.board[y][x] !== null)) {
        clearedRings.add(ring);
      }
    }
    if (clearedRings.size === 0) return 0;

    const shifts = Array(maxRing + 1).fill(0);
    let clearedInside = 0;
    for (let ring = 1; ring <= maxRing; ring++) {
      shifts[ring] = clearedInside;
      if (clearedRings.has(ring)) clearedInside += 1;
    }

    const source = this.getLockedCopy();
    const shifted = makeBaseBoard();
    const isCorner = (x: number, y: number, ring: number) =>
      (x === minCenterX - ring || x === maxCenterX + ring) && (y === minCenterY - ring || y === maxCenterY + ring);

    for (let ring = 1; ring <= maxRing; ring++) {
      if (clearedRings.has(ring)) continue;
      for (const [x, y] of ringCells[ring]) {
        const cell = source[y][x];
        if (cell === null || cell === 1) continue;
        const shift = shifts[ring];
        if (shift > 0 && isCorner(x, y, ring)) continue;
        let nx = x;
        let ny = y;
        for (let i = 0; i < shift; i++) [nx, ny] = stepTowardCenter(nx, ny);
        if (shifted[ny][nx] === null) shifted[ny][nx] = cell;
      }
    }

    const pruned = makeBaseBoard();
    for (let ring = 1; ring <= maxRing; ring++) {
      for (const [x, y] of ringCells[ring]) {
        const cell = shifted[y][x];
        if (cell === null || cell === 1) continue;
        const [ix, iy] = stepTowardCenter(x, y);
        if (pruned[iy][ix] !== null) pruned[y][x] = cell;
      }
    }

    this.board = pruned;
    return clearedRings.size;
  }
}

export { RingBoard };
