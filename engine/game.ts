import { Board } from "./board";
import { Hold } from "./hold";
import type { PieceType } from "./piece";
import { Piece } from "./piece";
import { Queue } from "./queue";
import { tryKicks } from "./srs";

export type GameSnapshot = {
  width: number;
  height: number;
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

class Game {
  readonly board: Board;
  private readonly queue: Queue;
  private readonly holdSlot: Hold;

  activePiece: Piece | null = null;
  private holdLocked = false;
  gameOver = false;

  private gravityMs = 0;
  readonly gravityIntervalMs: number;

  private lockDelayRemainingMs: number | null = null;
  private lockDelayResetsUsed = 0;

  constructor(
    width = 10,
    height = 20,
    gravityIntervalMs = 800,
  ) {
    this.board = new Board(width, height);
    this.queue = new Queue();
    this.holdSlot = new Hold();
    this.gravityIntervalMs = gravityIntervalMs;
    this.spawn();
  }

  private isOnGround(): boolean {
    if (!this.activePiece) return false;
    const [gx, gy] = this.board.gravityDelta();
    return !this.board.canMove(this.activePiece, gx, gy);
  }

  private resetLockResets(): void {
    this.lockDelayResetsUsed = 0;
  }

  private clearLockDelayState(): void {
    this.lockDelayRemainingMs = null;
    this.lockDelayResetsUsed = 0;
  }

  private onDownwardAdvance(): void {
    this.resetLockResets();
    this.lockDelayRemainingMs = this.isOnGround() ? LOCK_DELAY_MS : null;
  }

  private onGroundedMoveOrRotate(): void {
    if (!this.isOnGround()) {
      this.clearLockDelayState();
      return;
    }
    if (this.lockDelayResetsUsed < MAX_LOCK_RESETS) {
      this.lockDelayRemainingMs = LOCK_DELAY_MS;
      this.lockDelayResetsUsed += 1;
    }
  }

  getSnapshot(): GameSnapshot {
    return {
      width: this.board.width,
      height: this.board.height,
      boardRotation: this.board.rotation,
      locked: this.board.getLockedCopy(),
      active: this.activePiece,
      next: this.queue.peekNext(5),
      hold: this.holdSlot.getHoldType(),
      gameOver: this.gameOver,
    };
  }

  /** Where the next piece appears, relative to current `board.rotation` (entry side vs gravity). */
  private getSpawnCoords(): { x: number; y: number } {
    const w = this.board.width;
    const h = this.board.height;
    const r = ((this.board.rotation % 4) + 4) % 4;
    switch (r) {
      case 0:
        return { x: Math.floor(w / 2) - 2, y: 0 };
      case 1:
        return { x: 0, y: Math.floor(h / 2) - 2 };
      case 2:
        return { x: Math.floor(w / 2) - 2, y: h - 4 };
      case 3:
        return { x: w - 4, y: Math.floor(h / 2) - 2 };
      default:
        return { x: Math.floor(w / 2) - 2, y: 0 };
    }
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
      if (this.lockDelayRemainingMs === null) {
        this.lockDelayRemainingMs = LOCK_DELAY_MS;
      }
      this.lockDelayRemainingMs -= dtMs;
      if (this.lockDelayRemainingMs <= 0) {
        this.lockAndSpawn();
      }
    } else {
      this.lockDelayRemainingMs = null;
    }
  }

  /** One gravity step; returns true if piece moved along gravity. */
  private stepGravity(): boolean {
    if (!this.activePiece) return false;
    const [gx, gy] = this.board.gravityDelta();
    if (this.board.canMove(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
      this.onDownwardAdvance();
      return true;
    }
    return false;
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
    if (this.board.canMove(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
      this.onDownwardAdvance();
    } else {
      if (this.lockDelayRemainingMs === null) {
        this.lockDelayRemainingMs = LOCK_DELAY_MS;
      }
    }
  }

  hardDrop(): void {
    if (!this.activePiece || this.gameOver) return;
    const [gx, gy] = this.board.gravityDelta();
    while (this.board.canMove(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
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
      if (!this.board.canMove(swapped, 0, 0)) {
        this.gameOver = true;
        this.activePiece = null;
        return;
      }
      this.activePiece = swapped;
    } else {
      const s = this.getSpawnCoords();
      const next = this.queue.consumeNext(s.x, s.y);
      if (!this.board.canMove(next, 0, 0)) {
        this.gameOver = true;
        this.activePiece = null;
        return;
      }
      this.activePiece = next;
    }
    this.holdLocked = true;
    this.clearLockDelayState();
  }

  private tryMove(dx: number, dy: number): void {
    if (!this.activePiece || this.gameOver) return;
    if (this.board.canMove(this.activePiece, dx, dy)) {
      this.activePiece.move(dx, dy);
      this.onGroundedMoveOrRotate();
    }
  }

  private tryRotate(rotations: number): void {
    if (!this.activePiece || this.gameOver) return;
    if (this.board.canRotate(this.activePiece, rotations)) {
      this.activePiece.rotate(rotations);
      this.onGroundedMoveOrRotate();
    }
    else {
      const placement = 1
    }
  }

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

  private spawn(): void {
    if (this.gameOver) return;
    this.clearLockDelayState();
    const s = this.getSpawnCoords();
    const piece = this.queue.consumeNext(s.x, s.y);
    if (!this.board.canMove(piece, 0, 0)) {
      this.gameOver = true;
      this.activePiece = null;
      return;
    }
    this.activePiece = piece;
  }
}

export { Game };
