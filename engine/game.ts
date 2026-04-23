import { Board } from "./board";
import { Hold } from "./hold";
import type { PieceType } from "./piece";
import { Piece } from "./piece";
import { Queue } from "./queue";
import { tryKicks } from "./srs";

export type GameSnapshot = {
  width: number;
  height: number;
  viewOffsetX: number;
  viewOffsetY: number;
  /** 0–3: how many quarter-turns the playfield has taken (gravity cycles with this). */
  boardRotation: number;
  locked: (PieceType | null | 1)[][];
  active: Piece | null;
  next: PieceType[];
  hold: PieceType | null;
  gameOver: boolean;
};

const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const SPAWN_PAD = 2;

class Game {
  readonly board: Board;
  private readonly queue: Queue;
  private readonly holdSlot: Hold;
  readonly playWidth: number;
  readonly playHeight: number;
  readonly spawnPad: number;

  activePiece: Piece | null = null;
  private holdLocked = false;
  gameOver = false;

  private gravityMs = 0;
  readonly gravityIntervalMs: number;

  private lockTimerMs = 0;
  private lockDelayResetsUsed = 0;
  private lowestProgress = Number.NEGATIVE_INFINITY;
  private hasTouchedGround = false;

  constructor(
    width = 10,
    height = 20,
    gravityIntervalMs = 800,
  ) {
    this.playWidth = width;
    this.playHeight = height;
    this.spawnPad = SPAWN_PAD;
    this.board = new Board(width + SPAWN_PAD * 2, height + SPAWN_PAD * 2);
    this.queue = new Queue();
    this.holdSlot = new Hold();
    this.gravityIntervalMs = gravityIntervalMs;
    this.spawn();
  }

  getSnapshot(): GameSnapshot {
    return {
      width: this.playWidth,
      height: this.playHeight,
      viewOffsetX: this.spawnPad,
      viewOffsetY: this.spawnPad,
      boardRotation: this.board.rotation,
      locked: this.board.getLockedCopy(),
      active: this.activePiece,
      next: this.queue.peekNext(5),
      hold: this.holdSlot.getHoldType(),
      gameOver: this.gameOver,
    };
  }

  /** Advance simulation time; applies gravity when interval elapses. */
  tick(dtMs: number): void {
    if (this.gameOver || !this.activePiece) return;
    this.gravityMs += dtMs;
    while (this.gravityMs >= this.gravityIntervalMs) {
      this.gravityMs -= this.gravityIntervalMs;
      if (!this.stepGravity()) break;
    }

    if (!this.activePiece || this.gameOver) return;

    if (this.isOnGround()) {
      this.hasTouchedGround = true;
      this.lockTimerMs += dtMs;

      const lockDelayExpired = this.lockTimerMs >= LOCK_DELAY_MS;
      const lockResetsExhausted = this.lockDelayResetsUsed >= MAX_LOCK_RESETS;
      const shouldLock = lockDelayExpired || lockResetsExhausted;
      if (shouldLock) {
        if (this.board.isBottomBordered(this.activePiece)) {
          this.gameOver = true;
          this.activePiece = null;
          this.clearLockDelayState();
          return;
        }
        this.lockAndSpawn();
      }
    } else {
      this.lockTimerMs = 0;
    }
  }

  /** Predicate used by renderer and movement logic. */
  canMovePiece(piece: Piece, dx: number, dy: number): boolean {
    const nextX = piece.x + dx;
    const nextY = piece.y + dy;
    return this.canPlacePiece(piece, piece.rotation, nextX, nextY);
  }

  moveLeft(): void {
    const [dx, dy] = this.board.lateralLeftDelta();
    this.tryMove(dx, dy);
  }

  moveRight(): void {
    const [dx, dy] = this.board.lateralRightDelta();
    this.tryMove(dx, dy);
  }

  softDrop(): void {
    if (!this.activePiece || this.gameOver) return;
    const [gx, gy] = this.board.gravityDelta();
    if (this.canMovePiece(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
      this.onDownwardAdvance();
    }
  }

  hardDrop(): void {
    if (!this.activePiece || this.gameOver) return;
    const [gx, gy] = this.board.gravityDelta();
    while (this.canMovePiece(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
    }

    const shouldGameOverFromBorder = this.board.isBottomBordered(this.activePiece);
    if (shouldGameOverFromBorder) {
      this.gameOver = true;
      this.activePiece = null;
      this.clearLockDelayState();
      return;
    }

    this.lockAndSpawn();
  }

  rotateCw(): void {
    this.tryRotate(1);
  }

  rotateCcw(): void {
    this.tryRotate(-1);
  }

  hold(): void {
    if (!this.activePiece || this.gameOver || this.holdLocked) return;
    const cur = this.activePiece;
    const swapped = this.holdSlot.hold(cur);
    if (swapped) {
      const s = this.getSpawnCoords();
      swapped.x = s.x;
      swapped.y = s.y;
      swapped.rotation = 0;
      if (!this.canMovePiece(swapped, 0, 0)) {
        this.gameOver = true;
        this.activePiece = null;
        return;
      }
      this.activePiece = swapped;
      this.lowestProgress = this.pieceLow(swapped);
    } else {
      const s = this.getSpawnCoords();
      const next = this.queue.consumeNext(s.x, s.y);
      if (!this.canMovePiece(next, 0, 0)) {
        this.gameOver = true;
        this.activePiece = null;
        return;
      }
      this.activePiece = next;
      this.lowestProgress = this.pieceLow(next);
    }
    this.holdLocked = true;
    this.clearLockDelayState();
  }

  /** One gravity step; returns true if piece moved along gravity. */
  private stepGravity(): boolean {
    if (!this.activePiece) return false;
    const [gx, gy] = this.board.gravityDelta();
    if (this.canMovePiece(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
      this.onDownwardAdvance();
      return true;
    }
    return false;
  }

  /** Applies a move and handles grounded reset rules. */
  private tryMove(dx: number, dy: number): void {
    if (!this.activePiece || this.gameOver) return;
    if (this.canMovePiece(this.activePiece, dx, dy)) {
      this.activePiece.move(dx, dy);
      this.onGroundedAction();
    }
  }

  /** Applies rotation (with SRS kicks) and grounded reset rules. */
  private tryRotate(rotations: number): void {
    if (!this.activePiece || this.gameOver) return;
    if (this.canRotatePiece(this.activePiece, rotations)) {
      this.activePiece.rotate(rotations);
      this.onGroundedAction();
    }
    else {
      const newRotation = ((this.activePiece.rotation + rotations % 4) + 4 ) % 4
      const placement = tryKicks( {
        pieceType: this.activePiece.type,
        fromRot: this.activePiece.rotation,
        toRot: newRotation,
        spin: rotations === 1 ? 'cw' : 'ccw',
        baseX: this.activePiece.x,
        baseY: this.activePiece.y,
        canPlace: (rot, x, y) => {
          return this.canPlacePiece(this.activePiece!, rot, x, y);
        }
      })

      if(placement) {
        this.activePiece.x = placement!.x
        this.activePiece.y = placement!.y

        this.activePiece.rotate(rotations)
        //usedKick isn't necessary at this time
        this.onGroundedAction();
      }

    }
  }

  /** Whether the active piece is blocked in gravity direction. */
  private isOnGround(): boolean {
    if (!this.activePiece) return false;
    const [gx, gy] = this.board.gravityDelta();
    return !this.canMovePiece(this.activePiece, gx, gy);
  }

  private resetLockResets(): void {
    this.lockDelayResetsUsed = 0;
  }

  private clearLockDelayState(): void {
    this.lockTimerMs = 0;
    this.lockDelayResetsUsed = 0;
    this.hasTouchedGround = false;
  }

  private onDownwardAdvance(): void {
    const reachedNewLow = this.syncLowProgress();
    if (reachedNewLow) {
      this.resetLockResets();
      this.lockTimerMs = 0;
      this.hasTouchedGround = false;
    }
    if (this.isOnGround()) this.hasTouchedGround = true;
  }

  private onGroundedAction(): void {
    const reachedNewLow = this.syncLowProgress();
    if (reachedNewLow) {
      this.resetLockResets();
      this.lockTimerMs = 0;
      this.hasTouchedGround = false;
    }

    if (this.isOnGround()) this.hasTouchedGround = true;

    if (this.hasTouchedGround && !reachedNewLow && this.lockDelayResetsUsed < MAX_LOCK_RESETS) {
      this.lockTimerMs = 0;
      this.lockDelayResetsUsed += 1;
    }
  }

  /** Locks current piece, rotates board, and spawns the next piece. */
  private lockAndSpawn(): void {
    if (!this.activePiece) return;
    this.board.lockPiece(this.activePiece);
    this.board.clearLines();
    this.board.rotate();
    this.clearLockDelayState();
    this.holdLocked = false;
    this.activePiece = null;
    this.spawn();
  }

  /** Spawns next queue piece at current entry side. */
  private spawn(): void {
    if (this.gameOver) return;
    this.clearLockDelayState();
    const s = this.getSpawnCoords();
    const piece = this.queue.consumeNext(s.x, s.y);
    if (!this.canMovePiece(piece, 0, 0)) {
      this.gameOver = true;
      this.activePiece = null;
      return;
    }
    this.activePiece = piece;
    this.lowestProgress = this.pieceLow(piece);
  }

  /** Where the next piece appears, relative to current `board.rotation` (entry side vs gravity). */
  private getSpawnCoords(): { x: number; y: number } {
    const w = this.playWidth;
    const h = this.playHeight;
    const pad = this.spawnPad;
    const r = ((this.board.rotation % 4) + 4) % 4;
    switch (r) {
      case 0:
        return { x: pad + Math.floor(w / 2) - 2, y: pad - 2 };
      case 1:
        return { x: pad - 2, y: pad + Math.floor(h / 2) - 2 };
      case 2:
        return { x: pad + Math.floor(w / 2) - 2, y: pad + h - 2 };
      case 3:
        return { x: pad + w - 2, y: pad + Math.floor(h / 2) - 2 };
      default:
        return { x: pad + Math.floor(w / 2) - 2, y: pad - 2 };
    }
  }

  /** Visible playfield bounds inside the padded internal board. */
  private getVisibleBounds() {
    const minX = this.spawnPad;
    const maxX = this.spawnPad + this.playWidth - 1;
    const minY = this.spawnPad;
    const maxY = this.spawnPad + this.playHeight - 1;
    return { minX, maxX, minY, maxY };
  }

  /** Enforces spawn-buffer visibility rules by current gravity orientation. */
  private respectsViewBounds(piece: Piece, rotation: number, x: number, y: number): boolean {
    const shape = piece.get_shape(rotation);
    const { minX, maxX, minY, maxY } = this.getVisibleBounds();
    const r = ((this.board.rotation % 4) + 4) % 4;

    for (const [rowIdx, row] of shape.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const px = x + colIdx;
        const py = y + rowIdx;
        switch (r) {
          case 0:
            if (px < minX || px > maxX || py > maxY) return false;
            break;
          case 1:
            if (py < minY || py > maxY || px > maxX) return false;
            break;
          case 2:
            if (px < minX || px > maxX || py < minY) return false;
            break;
          case 3:
            if (py < minY || py > maxY || px < minX) return false;
            break;
          default:
            if (px < minX || px > maxX || py < minY || py > maxY) return false;
            break;
        }
      }
    }
    return true;
  }

  /** Absolute placement check: collision + view-bounds constraint. */
  private canPlacePiece(piece: Piece, rotation: number, x: number, y: number): boolean {
    return (
      this.board.canPlace(piece, rotation, x - piece.x, y - piece.y) &&
      this.respectsViewBounds(piece, rotation, x, y)
    );
  }

  /** Returns whether you can feasibly rotate a piece */
  private canRotatePiece(piece: Piece, rotations: number): boolean {
    const newRotation = (((piece.rotation + rotations) % 4) + 4) % 4;
    return this.canPlacePiece(piece, newRotation, piece.x, piece.y);
  }

  /** Gravity-relative low-point of the current piece */
  private pieceLow(piece: Piece): number {
    const shape = piece.get_shape(piece.rotation);
    const [gx, gy] = this.board.gravityDelta();
    let low = Number.NEGATIVE_INFINITY;
    for (const [rowIdx, row] of shape.entries()) {
      for (const [colIdx, cell] of row.entries()) {
        if (cell === 0) continue;
        const x = piece.x + colIdx;
        const y = piece.y + rowIdx;
        low = Math.max(low, x * gx + y * gy);
      }
    }
    return low;
  }

  /** Updates lowest-progress tracker; true when a strict new low is reached. */
  private syncLowProgress(): boolean {
    if (!this.activePiece) return false;
    const low = this.pieceLow(this.activePiece);
    if (this.lowestProgress === Number.NEGATIVE_INFINITY) {
      this.lowestProgress = low;
      return false;
    }
    if (low > this.lowestProgress) {
      this.lowestProgress = low;
      return true;
    }
    return false;
  }
}

export { Game };
