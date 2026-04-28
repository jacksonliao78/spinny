import type { BoardFactory, BoardModel } from "../board/types";
import { createBoard } from "../board/factory";
import {
  DEFAULT_GAME_CONFIG,
  DEFAULT_GAME_RULES,
  getComboBonusPoints,
  getGravityIntervalMs,
  getLineClearBasePoints,
} from "./rules";
import { Hold } from "../hold";
import type { PieceType } from "../piece";
import { Piece } from "../piece";
import { Queue } from "../queue";
import { tryKicks } from "../srs";
import type { GameConfig, GameMode } from "./rules";
import { pieceLow, syncLowProgress } from "./progression";
import {
  applyDownwardAdvanceLockDelayTransition,
  applyGroundedActionLockDelayTransition,
  lockDelayShouldLock,
} from "./lock_delay";
import { getSpawnCoords, getVisibleBounds, respectsViewBounds } from "./spawn_bounds";

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
  score: number;
  level: number;
  combo: number;
  linesClearedTotal: number;
  gameMode: GameMode;
  remainingMs: number | null;
  gravityIntervalMs: number;
  gameOver: boolean;
};

const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const SPAWN_PAD = 2;

class Game {
  readonly board: BoardModel;
  private readonly queue: Queue;
  private readonly holdSlot: Hold;
  readonly playWidth: number;
  readonly playHeight: number;
  readonly spawnPad: number;

  activePiece: Piece | null = null;
  private holdLocked = false;
  gameOver = false;

  private gravityMs = 0;
  private readonly config: GameConfig;
  private readonly gameMode: GameMode;
  private readonly timedDurationMs: number;
  private baseGravityIntervalMs: number;
  private score = 0;
  private level = 1;
  private combo = 0;
  private linesClearedTotal = 0;
  private remainingMs: number | null;

  private lockTimerMs = 0;
  private lockDelayResetsUsed = 0;
  private lowestProgress = Number.NEGATIVE_INFINITY;
  private hasTouchedGround = false;

  constructor(
    width = DEFAULT_GAME_RULES.width,
    height = DEFAULT_GAME_RULES.height,
    gravityIntervalMs = DEFAULT_GAME_RULES.gravityIntervalMs,
    boardFactory: BoardFactory = (boardWidth, boardHeight) => createBoard("ring", boardWidth, boardHeight),
    config: Partial<GameConfig> = {},
  ) {
    this.playWidth = width;
    this.playHeight = height;
    this.spawnPad = SPAWN_PAD;
    this.board = boardFactory(width + SPAWN_PAD * 2, height + SPAWN_PAD * 2);
    this.queue = new Queue();
    this.holdSlot = new Hold();
    this.config = {
      ...DEFAULT_GAME_CONFIG,
      ...config,
      timed: {
        ...DEFAULT_GAME_CONFIG.timed,
        ...config.timed,
      },
      lineClearPoints: {
        ...DEFAULT_GAME_CONFIG.lineClearPoints,
        ...config.lineClearPoints,
      },
    };
    this.gameMode = this.config.mode;
    this.timedDurationMs = this.config.timed.durationMs;
    this.baseGravityIntervalMs = gravityIntervalMs;
    this.remainingMs = this.gameMode === "timed" ? this.timedDurationMs : null;
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
      score: this.score,
      level: this.level,
      combo: Math.max(0, this.combo - 1),
      linesClearedTotal: this.linesClearedTotal,
      gameMode: this.gameMode,
      remainingMs: this.remainingMs,
      gravityIntervalMs: this.currentGravityIntervalMs(),
      gameOver: this.gameOver,
    };
  }

  /** Advance simulation time; applies gravity when interval elapses. */
  tick(dtMs: number): void {
    if (this.gameMode === "timed" && this.remainingMs !== null) {
      this.remainingMs = Math.max(0, this.remainingMs - dtMs);
      if (this.remainingMs === 0) {
        this.gameOver = true;
        this.activePiece = null;
      }
    }
    if (this.gameOver || !this.activePiece) return;
    if (this.gameMode !== "zen") {
      this.gravityMs += dtMs;
      while (this.gravityMs >= this.currentGravityIntervalMs()) {
        this.gravityMs -= this.currentGravityIntervalMs();
        if (!this.stepGravity()) break;
      }
    }

    if (!this.activePiece || this.gameOver) return;

    if (this.isOnGround()) {
      this.hasTouchedGround = true;
      this.lockTimerMs += dtMs;

      const shouldLock = lockDelayShouldLock(
        {
          lockTimerMs: this.lockTimerMs,
          lockDelayResetsUsed: this.lockDelayResetsUsed,
          hasTouchedGround: this.hasTouchedGround,
        },
        LOCK_DELAY_MS,
        MAX_LOCK_RESETS,
      );
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
      this.score += this.config.softDropPointPerCell;
      this.onDownwardAdvance();
    }
  }

  hardDrop(): void {
    if (!this.activePiece || this.gameOver) return;
    const [gx, gy] = this.board.gravityDelta();
    let movedCells = 0;
    while (this.canMovePiece(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
      movedCells += 1;
    }
    this.score += movedCells * this.config.hardDropPointPerCell;

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
      const newRotation = ((this.activePiece.rotation + rotations % 4) + 4 ) % 4;
      const placement = tryKicks( {
        pieceType: this.activePiece.type,
        fromRot: this.activePiece.rotation,
        toRot: newRotation,
        spin: rotations === 1 ? "cw" : "ccw",
        baseX: this.activePiece.x,
        baseY: this.activePiece.y,
        canPlace: (rot, x, y) => {
          return this.canPlacePiece(this.activePiece!, rot, x, y);
        }
      });

      if(placement) {
        this.activePiece.x = placement.x;
        this.activePiece.y = placement.y;

        this.activePiece.rotate(rotations);
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

  private clearLockDelayState(): void {
    this.lockTimerMs = 0;
    this.lockDelayResetsUsed = 0;
    this.hasTouchedGround = false;
  }

  private onDownwardAdvance(): void {
    const reachedNewLow = this.syncLowProgress();
    const next = applyDownwardAdvanceLockDelayTransition(
      {
        lockTimerMs: this.lockTimerMs,
        lockDelayResetsUsed: this.lockDelayResetsUsed,
        hasTouchedGround: this.hasTouchedGround,
      },
      reachedNewLow,
      this.isOnGround(),
    );
    this.lockTimerMs = next.lockTimerMs;
    this.lockDelayResetsUsed = next.lockDelayResetsUsed;
    this.hasTouchedGround = next.hasTouchedGround;
  }

  private onGroundedAction(): void {
    const reachedNewLow = this.syncLowProgress();
    const next = applyGroundedActionLockDelayTransition(
      {
        lockTimerMs: this.lockTimerMs,
        lockDelayResetsUsed: this.lockDelayResetsUsed,
        hasTouchedGround: this.hasTouchedGround,
      },
      reachedNewLow,
      this.isOnGround(),
      MAX_LOCK_RESETS,
    );
    this.lockTimerMs = next.lockTimerMs;
    this.lockDelayResetsUsed = next.lockDelayResetsUsed;
    this.hasTouchedGround = next.hasTouchedGround;
  }

  /** Locks current piece, rotates board, and spawns the next piece. */
  private lockAndSpawn(): void {
    if (!this.activePiece) return;
    this.board.lockPiece(this.activePiece);
    const linesCleared = this.board.clearLines();
    this.applyLineClearProgress(linesCleared);
    this.board.rotate();
    this.clearLockDelayState();
    this.holdLocked = false;
    this.activePiece = null;
    this.spawn();
  }

  private applyLineClearProgress(linesCleared: number): void {
    if (linesCleared <= 0) {
      this.combo = 0;
      return;
    }
    const base = getLineClearBasePoints(linesCleared, this.config);
    const comboBonus = getComboBonusPoints(this.combo, this.config);
    this.score += (base + comboBonus) * this.level;
    this.combo += 1;
    this.linesClearedTotal += linesCleared;
    if (this.gameMode === "zen") return;
    const nextLevel = Math.floor(this.linesClearedTotal / this.config.linesPerLevel) + 1;
    this.level = Math.max(1, nextLevel);
  }

  private currentGravityIntervalMs(): number {
    const derived = getGravityIntervalMs(this.level, {
      ...this.config,
      baseGravityIntervalMs: this.baseGravityIntervalMs,
    });
    return derived;
  }

  /** Spawns next queue piece at current entry side. */
  private spawn(): void {
    if (this.gameOver) return;
    this.clearLockDelayState();
    const s = getSpawnCoords(this.playWidth, this.playHeight, this.spawnPad, this.board.rotation);
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
    return getSpawnCoords(this.playWidth, this.playHeight, this.spawnPad, this.board.rotation);
  }

  /** Visible playfield bounds inside the padded internal board. */
  private getVisibleBounds() {
    return getVisibleBounds(this.playWidth, this.playHeight, this.spawnPad);
  }

  /** Enforces spawn-buffer visibility rules by current gravity orientation. */
  private respectsViewBounds(piece: Piece, rotation: number, x: number, y: number): boolean {
    return respectsViewBounds(
      piece,
      rotation,
      x,
      y,
      this.getVisibleBounds(),
      this.board.rotation,
    );
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
    return pieceLow(piece, this.board.gravityDelta());
  }

  /** Updates lowest-progress tracker; true when a strict new low is reached. */
  private syncLowProgress(): boolean {
    if (!this.activePiece) return false;
    const next = syncLowProgress(this.lowestProgress, this.pieceLow(this.activePiece));
    this.lowestProgress = next.low;
    return next.reachedNewLow;
  }
}

export { Game };
