import { Piece } from "../piece";
import { pickGarbageHoles } from "./garbage";
import type { RandomSource } from "./garbage";
import { SOLID_CELL } from "./types";
import type { BoardCell, BoardModel } from "./types";

/** Ring board with an immobile 3x3 center and line clears based on complete square rings. */
class RingBoard implements BoardModel {
  width: number;
  height: number;
  board: BoardCell[][];

  center: number;
  rotation: number;
  private readonly random: RandomSource;

  constructor(width: number, height: number, random: RandomSource = Math.random) {
    this.width = width;
    this.height = height;

    this.board = Array.from({ length: height }, () => Array<BoardCell>(width).fill(null));
    const centerStartX = Math.floor((width - 3) / 2);
    const centerStartY = Math.floor((height - 3) / 2);
    for (let y = centerStartY; y < centerStartY + 3; y++) {
      for (let x = centerStartX; x < centerStartX + 3; x++) {
        if (y >= 0 && y < height && x >= 0 && x < width) {
          this.board[y][x] = SOLID_CELL;
        }
      }
    }
    this.center = width / 2 - 1;

    this.rotation = 0;
    this.random = random;
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
  getLockedCopy(): BoardCell[][] {
    return this.board.map((row) => [...row]);
  }

  canPlace(piece: Piece, rotation: number, offsetX: number, offsetY: number): boolean {
    const curPiece = piece.get_shape(rotation);
    for (const [rowIdx, row] of curPiece.entries()) {
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

  isContactLoss(piece: Piece): boolean {
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

  /** Fill the outer ring with solid garbage, leaving evenly spaced holes and preserving existing cells. */
  addGarbage(rings: number, holesPerRing: number): number {
    const amount = Math.max(0, Math.floor(rings));
    if (amount === 0) return 0;

    const outerRing = this.getMaxRing();
    const cells = this.getRingCells(outerRing);
    if (cells.length === 0) return 0;

    const holes = pickGarbageHoles(cells.length, holesPerRing, this.random);
    let applied = 0;
    for (let i = 0; i < amount; i++) {
      let placedCells = 0;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        if (holes.has(cellIndex)) continue;
        const [x, y] = cells[cellIndex];
        if (this.board[y][x] !== null) continue;
        this.board[y][x] = SOLID_CELL;
        placedCells += 1;
      }
      if (placedCells === 0) break;
      applied += 1;
    }
    return applied;
  }

  /**
   * Clear full square rings, then compact surviving cells inward.
   * Corners deleted during compaction keep the shrunken ring shape from overfilling.
   */
  clearLines(): number {
    const { minCenterX, minCenterY, maxCenterX, maxCenterY } = this.getCenterBounds();
    const maxRing = this.getMaxRing();
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
      const out = Array.from({ length: this.height }, () => Array<BoardCell>(this.width).fill(null));
      for (let y = minCenterY; y <= maxCenterY; y++) {
        for (let x = minCenterX; x <= maxCenterX; x++) out[y][x] = SOLID_CELL;
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
        if (cell === null || cell === SOLID_CELL) continue;
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
        if (cell === null || cell === SOLID_CELL) continue;
        const [ix, iy] = stepTowardCenter(x, y);
        if (pruned[iy][ix] !== null) pruned[y][x] = cell;
      }
    }

    this.board = pruned;
    return clearedRings.size;
  }

  private getCenterBounds() {
    const minCenterX = Math.floor((this.width - 3) / 2);
    const minCenterY = Math.floor((this.height - 3) / 2);
    return {
      minCenterX,
      minCenterY,
      maxCenterX: minCenterX + 2,
      maxCenterY: minCenterY + 2,
    };
  }

  private getMaxRing(): number {
    const { minCenterX, minCenterY, maxCenterX, maxCenterY } = this.getCenterBounds();
    return Math.max(minCenterX, minCenterY, this.width - 1 - maxCenterX, this.height - 1 - maxCenterY);
  }

  private getRingCells(targetRing: number): [number, number][] {
    const { minCenterX, minCenterY, maxCenterX, maxCenterY } = this.getCenterBounds();
    const ringDistance = (x: number, y: number) => {
      const dx = x < minCenterX ? minCenterX - x : x > maxCenterX ? x - maxCenterX : 0;
      const dy = y < minCenterY ? minCenterY - y : y > maxCenterY ? y - maxCenterY : 0;
      return Math.max(dx, dy);
    };
    const cells: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (ringDistance(x, y) === targetRing) cells.push([x, y]);
      }
    }
    return cells;
  }
}

export { RingBoard };
