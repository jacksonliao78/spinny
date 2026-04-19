import { PieceType, Piece } from "./piece";

class Board {
  width: number;
  height: number;
  board: (PieceType | null | 1)[][];

  center: number;
  rotation: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.board = Array.from({ length: height }, () => Array<PieceType | null | 1>(width).fill(null));
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
  getLockedCopy(): (PieceType | null)[][] {
    return this.board.map((row) =>
      row.map((c) => (c === null || c === 1 ? null : c)),
    );
  }

  canMove(piece: Piece, dx: number, dy: number): boolean {
    const shape = piece.get_shape(piece.rotation);
    for (const [rowIdx, row] of shape.entries()) {
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
    return 0;
  }
}

export { Board };
