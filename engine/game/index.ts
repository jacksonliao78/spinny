import type { BoardModel } from "../board/types";
import { createBoard } from "../board/factory";
import {
  getComboBonusPoints,
  getGravityIntervalMs,
  getLineClearBasePoints,
  GAME_MODE_POLICIES,
  resolveGameConfig,
} from "./rules";
import { Hold } from "../hold";
import type { PieceType } from "../piece";
import { Piece } from "../piece";
import { Queue } from "../queue";
import { try180Kicks, tryKicks } from "../srs";
import { getAttackLines } from "./attack";
import type { GameConfig, GameMode, GameModePolicy } from "./rules";
import { pieceLow, syncLowProgress } from "./progression";
import {
  applyDownwardAdvanceLockDelayTransition,
  applyGroundedActionLockDelayTransition,
  lockDelayShouldLock,
} from "./lock_delay";
import { getSpawnCoords, getVisibleBounds, respectsViewBounds } from "./spawn_bounds";
import { createRunMetrics } from "./metrics";
import { cloneRunStats, createRunStats } from "./run_stats";
import { detectSpin } from "./rotation";
import type { LastRotation, SpinResult } from "./rotation";
import type { GameOptions, GameSnapshot, GarbageAttackEvent, RunSummary, SurvivalSnapshot } from "./types";

export type {
  GameOptions,
  GarbageAttackEvent,
  GameSnapshot,
  RunAttackMetrics,
  RunBackToBackMetrics,
  RunMetrics,
  RunSpeedMetrics,
  RunStats,
  RunSummary,
} from "./types";

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
  private readonly modePolicy: GameModePolicy;
  private readonly timedDurationMs: number;
  private readonly sprintTargetClears: number;
  private score = 0;
  private level = 1;
  private combo = 0;
  private linesClearedTotal = 0;
  private incomingGarbage = 0;
  private remainingMs: number | null;
  private elapsedMs = 0;
  private survivalLastEnqueueMs = 0;
  private lastRotation: LastRotation | null = null;
  private lastSpin: SpinResult | null = null;
  private nextGarbageAttackId = 1;
  private readonly pendingGarbageAttackEvents: GarbageAttackEvent[] = [];

  private lockTimerMs = 0;
  private lockDelayResetsUsed = 0;
  private lowestProgress = Number.NEGATIVE_INFINITY;
  private hasTouchedGround = false;
  private readonly runStats = createRunStats();

  constructor(options: GameOptions = {}) {
    this.config = resolveGameConfig(options.config);
    const random = options.random ?? Math.random;
    const boardFactory =
      options.boardFactory ?? ((boardWidth, boardHeight, boardRandom) => createBoard("ring", boardWidth, boardHeight, boardRandom));
    this.playWidth = this.config.board.width;
    this.playHeight = this.config.board.height;
    this.spawnPad = SPAWN_PAD;
    this.board = boardFactory(this.playWidth + SPAWN_PAD * 2, this.playHeight + SPAWN_PAD * 2, random);
    this.queue = new Queue(random);
    this.holdSlot = new Hold();
    this.gameMode = this.config.mode.kind;
    this.modePolicy = GAME_MODE_POLICIES[this.gameMode];
    this.timedDurationMs = this.config.mode.timedDurationMs;
    this.sprintTargetClears = Math.max(1, Math.floor(this.config.mode.sprintTargetClears));
    this.remainingMs = this.modePolicy.timerStyle === "countdown" ? this.timedDurationMs : null;
    if (!options.deferFirstSpawn) this.beginRun();
  }

  beginRun(): void {
    if (this.activePiece || this.gameOver) return;
    this.spawn();
  }

  getSnapshot(): GameSnapshot {
    const metrics = createRunMetrics(this.runStats, this.elapsedMs);
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
      b2b: this.runStats.b2bChain,
      piecesPlaced: this.runStats.locksPlaced,
      piecesPerSecond: metrics.speed.piecesPerSecond,
      linesClearedTotal: this.linesClearedTotal,
      garbageEnabled: this.config.garbage.enabled,
      incomingGarbage: this.incomingGarbage,
      survival: this.getSurvivalSnapshot(),
      gameMode: this.gameMode,
      remainingMs: this.remainingMs,
      elapsedMs: this.elapsedMs,
      sprintTargetClears: this.sprintTargetClears,
      gravityIntervalMs: this.currentGravityIntervalMs(),
      lastSpin: this.lastSpin,
      gameOver: this.gameOver,
    };
  }

  getRunSummary(durationMs = 0): RunSummary {
    const stats = cloneRunStats(this.runStats);
    return {
      width: this.playWidth,
      height: this.playHeight,
      gameMode: this.gameMode,
      score: this.score,
      level: this.level,
      linesClearedTotal: this.linesClearedTotal,
      remainingMs: this.remainingMs,
      gameOver: this.gameOver,
      stats,
      metrics: createRunMetrics(stats, durationMs),
    };
  }

  consumeGarbageAttackEvents(): GarbageAttackEvent[] {
    const events = [...this.pendingGarbageAttackEvents];
    this.pendingGarbageAttackEvents.length = 0;
    return events;
  }

  /** Advance simulation time; applies gravity when interval elapses. */
  tick(dtMs: number): void {
    if (!this.gameOver) this.elapsedMs += dtMs;
    if (this.modePolicy.timerStyle === "countdown" && this.remainingMs !== null) {
      this.remainingMs = Math.max(0, this.remainingMs - dtMs);
      if (this.remainingMs === 0) this.endGame();
    }
    this.tickSurvivalProducer();
    this.drainQueuedGarbageDuringTick();
    if (this.gameOver || !this.activePiece) return;
    this.gravityMs += dtMs;
    while (this.gravityMs >= this.currentGravityIntervalMs()) {
      this.gravityMs -= this.currentGravityIntervalMs();
      if (!this.stepGravity()) break;
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
        if (this.board.isContactLoss(this.activePiece)) {
          this.endGame();
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
      this.clearLastRotation();
      this.score += this.config.scoring.softDropPointPerCell;
      this.runStats.softDropCellsTotal += 1;
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
    if (movedCells > 0) this.clearLastRotation();
    this.score += movedCells * this.config.scoring.hardDropPointPerCell;
    this.runStats.hardDropCellsTotal += movedCells;

    const isContactLoss = this.board.isContactLoss(this.activePiece);
    if (isContactLoss) {
      this.endGame();
      this.clearLockDelayState();
      return;
    }

    this.lockAndSpawn();
  }

  placeActivePieceAt(
    x: number,
    y: number,
    rotation: number,
    options: { markAsRotated?: boolean } = {},
  ): boolean {
    if (!this.activePiece || this.gameOver) return false;
    const normalizedRotation = (((rotation % 4) + 4) % 4);
    if (!this.canPlacePiece(this.activePiece, normalizedRotation, x, y)) return false;

    this.activePiece.x = x;
    this.activePiece.y = y;
    this.activePiece.rotation = normalizedRotation;
    this.lowestProgress = this.pieceLow(this.activePiece);
    if (options.markAsRotated) this.recordLastRotation(this.activePiece, false);
    else this.clearLastRotation();

    if (this.board.isContactLoss(this.activePiece)) {
      this.endGame();
      this.clearLockDelayState();
      return true;
    }

    this.lockAndSpawn();
    return true;
  }

  rotateCw(): void {
    this.tryRotate(1);
  }

  rotateCcw(): void {
    this.tryRotate(-1);
  }

  /** 180° rotation (TETR.IO-style kick table; not two quarter turns). */
  rotate180(): void {
    this.tryRotate(2);
  }

  hold(): void {
    if (!this.activePiece || this.gameOver || this.holdLocked) return;
    this.clearLastRotation();
    const cur = this.activePiece;
    const swapped = this.holdSlot.hold(cur);
    if (swapped) {
      const s = this.getSpawnCoords();
      swapped.x = s.x;
      swapped.y = s.y;
      swapped.rotation = 0;
      if (!this.canMovePiece(swapped, 0, 0)) {
        this.endGame();
        return;
      }
      this.activePiece = swapped;
      this.lowestProgress = this.pieceLow(swapped);
    } else {
      const s = this.getSpawnCoords();
      const next = this.queue.consumeNext(s.x, s.y);
      if (!this.canMovePiece(next, 0, 0)) {
        this.endGame();
        return;
      }
      this.activePiece = next;
      this.lowestProgress = this.pieceLow(next);
    }
    this.runStats.holdUses += 1;
    this.holdLocked = true;
    this.clearLockDelayState();
  }

  /** Queue incoming garbage for modes that enable it; ignored by Timed/Zen defaults. */
  enqueueGarbage(amount: number): void {
    if (!this.config.garbage.enabled) return;
    const queued = Math.max(0, Math.floor(amount));
    if (queued <= 0) return;
    this.incomingGarbage += queued;
    this.runStats.garbageReceivedEvents += 1;
    this.runStats.garbageReceivedTotal += queued;
  }

  /** One gravity step; returns true if piece moved along gravity. */
  private stepGravity(): boolean {
    if (!this.activePiece) return false;
    const [gx, gy] = this.board.gravityDelta();
    if (this.canMovePiece(this.activePiece, gx, gy)) {
      this.activePiece.move(gx, gy);
      this.clearLastRotation();
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
      this.clearLastRotation();
      this.onGroundedAction();
    }
  }

  /** Applies rotation (with SRS kicks) and grounded reset rules. */
  private tryRotate(rotations: number): void {
    if (!this.activePiece || this.gameOver) return;
    const step = ((rotations % 4) + 4) % 4;
    if (step === 0) return;

    if (this.canRotatePiece(this.activePiece, rotations)) {
      this.activePiece.rotate(rotations);
      this.recordLastRotation(this.activePiece, false);
      this.onGroundedAction();
      return;
    }

    const newRotation = (((this.activePiece.rotation + rotations) % 4) + 4) % 4;

    if (step === 2) {
      const placement = try180Kicks({
        pieceType: this.activePiece.type,
        fromRot: this.activePiece.rotation,
        toRot: newRotation,
        baseX: this.activePiece.x,
        baseY: this.activePiece.y,
        canPlace: (rot, x, y) => this.canPlacePiece(this.activePiece!, rot, x, y),
      });
      if (placement) {
        this.activePiece.x = placement.x;
        this.activePiece.y = placement.y;
        this.activePiece.rotate(rotations);
        this.recordLastRotation(
          this.activePiece,
          placement.usedKick[0] !== 0 || placement.usedKick[1] !== 0,
        );
        this.onGroundedAction();
      }
      return;
    }

    const spin = step === 1 ? "cw" : "ccw";
    const placement = tryKicks({
      pieceType: this.activePiece.type,
      fromRot: this.activePiece.rotation,
      toRot: newRotation,
      spin,
      baseX: this.activePiece.x,
      baseY: this.activePiece.y,
      canPlace: (rot, x, y) => this.canPlacePiece(this.activePiece!, rot, x, y),
    });

    if (placement) {
      this.activePiece.x = placement.x;
      this.activePiece.y = placement.y;

      this.activePiece.rotate(rotations);
      this.recordLastRotation(
        this.activePiece,
        placement.usedKick[0] !== 0 || placement.usedKick[1] !== 0,
      );
      this.onGroundedAction();
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

  private clearLastRotation(): void {
    this.lastRotation = null;
  }

  private recordLastRotation(piece: Piece, usedKick: boolean): void {
    this.lastRotation = {
      pieceType: piece.type,
      x: piece.x,
      y: piece.y,
      rotation: piece.rotation,
      usedKick,
    };
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

  /** Lock current piece, resolve clear/scoring/garbage, rotate the board, then spawn next. */
  private lockAndSpawn(): void {
    if (!this.activePiece) return;
    this.lastSpin = detectSpin({
      piece: this.activePiece,
      lastRotation: this.lastRotation,
      config: this.config,
      board: this.board,
      visibleBounds: this.getVisibleBounds(),
      canMovePiece: (piece, dx, dy) => this.canMovePiece(piece, dx, dy),
    });
    const lockedPieceType = this.activePiece.type;
    this.board.lockPiece(this.activePiece);
    const linesCleared = this.board.clearLines();
    this.recordLockStats(lockedPieceType, linesCleared, this.lastSpin);
    this.applyLineClearProgress(linesCleared);
    this.runStats.maxCombo = Math.max(this.runStats.maxCombo, Math.max(0, this.combo - 1));
    this.resolveOutgoingGarbageAttack(linesCleared, this.lastSpin);
    if (this.gameOver) {
      this.activePiece = null;
      this.clearLockDelayState();
      this.holdLocked = false;
      return;
    }
    this.board.rotate();
    this.applyQueuedGarbage();
    this.clearLockDelayState();
    this.holdLocked = false;
    this.activePiece = null;
    this.spawn();
  }

  private recordLockStats(pieceType: PieceType, linesCleared: number, spin: SpinResult | null): void {
    this.runStats.locksPlaced += 1;
    this.runStats.piecesByType[pieceType] += 1;
    if (linesCleared <= 0) this.runStats.lineClearsByCount.zero += 1;
    else if (linesCleared === 1) this.runStats.lineClearsByCount.single += 1;
    else if (linesCleared === 2) this.runStats.lineClearsByCount.double += 1;
    else if (linesCleared === 3) this.runStats.lineClearsByCount.triple += 1;
    else this.runStats.lineClearsByCount.quadPlus += 1;

    // Back-to-back: only quads and non-zero T-spin clears qualify for now.
    if (linesCleared > 0) {
      const isQuad = linesCleared >= 4;
      const isTSpinClear = spin?.kind === "t-spin";
      const qualifies = isQuad || isTSpinClear;
      if (qualifies) {
        this.runStats.b2bChain += 1;
        this.runStats.b2bMaxChain = Math.max(this.runStats.b2bMaxChain, this.runStats.b2bChain);
      } else {
        this.runStats.b2bChain = 0;
      }
    }

    if (spin?.kind === "t-spin") {
      this.runStats.tSpinCount += 1;
      if (linesCleared === 1) this.runStats.tSpinSingles += 1;
      else if (linesCleared === 2) this.runStats.tSpinDoubles += 1;
      else if (linesCleared === 3) this.runStats.tSpinTriples += 1;
    }
    if (spin?.kind === "all-spin") this.runStats.allSpinCount += 1;
  }

  /** Apply scoring, combo, line total, and level progression for a completed lock. */
  private applyLineClearProgress(linesCleared: number): void {
    if (linesCleared <= 0) {
      this.combo = 0;
      return;
    }
    const base = getLineClearBasePoints(linesCleared, this.config);
    const comboBonus = getComboBonusPoints(this.combo, this.config);
    this.score += (base + comboBonus) * this.level;
    this.combo += 1;
    const clearProgress = this.modePolicy.completesAtSprintTarget
      ? Math.min(linesCleared, Math.max(0, this.sprintTargetClears - this.linesClearedTotal))
      : linesCleared;
    this.linesClearedTotal += clearProgress;
    if (this.modePolicy.completesAtSprintTarget && this.linesClearedTotal >= this.sprintTargetClears) {
      this.endGame();
      return;
    }
    if (!this.modePolicy.advancesLevel) return;
    const nextLevel = Math.floor(this.linesClearedTotal / this.config.gravity.linesPerLevel) + 1;
    this.level = Math.max(1, nextLevel);
  }

  private resolveOutgoingGarbageAttack(linesCleared: number, spin: SpinResult | null): void {
    if (!this.config.garbage.enabled) return;
    const amount = getAttackLines({
      linesCleared,
      spin,
      combo: Math.max(0, this.combo - 1),
      backToBackChain: this.runStats.b2bChain,
    });
    if (amount <= 0) return;

    const canceled = Math.min(amount, this.incomingGarbage);
    this.incomingGarbage -= canceled;
    const netAmount = amount - canceled;
    if (netAmount <= 0) return;
    this.pendingGarbageAttackEvents.push({
      id: this.nextGarbageAttackId,
      amount: netAmount,
    });
    this.nextGarbageAttackId += 1;
  }

  /** Apply a capped amount of queued garbage after clears so garbage never blocks a clear first. */
  private applyQueuedGarbage(): number {
    if (!this.config.garbage.enabled) return 0;
    if (this.incomingGarbage <= 0) return 0;
    const amount = Math.min(this.incomingGarbage, this.config.garbage.maxPerApply);
    const groupSize = Math.max(1, Math.floor(this.config.garbage.groupSize));
    let remaining = amount;
    let appliedTotal = 0;
    while (remaining > 0) {
      const nextGroup = Math.min(groupSize, remaining);
      const applied = this.board.addGarbage(nextGroup, this.config.garbage.holesPerRing);
      if (applied <= 0) break;
      appliedTotal += applied;
      remaining -= applied;
      if (applied < nextGroup) break;
    }
    this.incomingGarbage -= appliedTotal;
    this.runStats.garbageAppliedTotal += appliedTotal;
    return appliedTotal;
  }

  /** Drain queued garbage during a normal tick so survival pressure rises continuously, not only on lock. */
  private drainQueuedGarbageDuringTick(): void {
    if (this.gameOver) return;
    if (!this.config.garbage.survival) return;
    const applied = this.applyQueuedGarbage();
    if (applied <= 0) return;
    const piece = this.activePiece;
    if (!piece) return;
    if (this.canMovePiece(piece, 0, 0)) return;
    // Garbage pushed locked cells into the active piece; ride the rising stack in the negative-gravity direction.
    const [gx, gy] = this.board.gravityDelta();
    for (let i = 0; i < applied; i += 1) {
      if (this.canMovePiece(piece, 0, 0)) break;
      if (!this.canPlacePiece(piece, piece.rotation, piece.x - gx, piece.y - gy)) break;
      piece.move(-gx, -gy);
      this.clearLastRotation();
    }
    if (!this.canMovePiece(piece, 0, 0)) {
      this.endGame();
      this.clearLockDelayState();
    }
  }

  /** Drives the time-based survival garbage producer when configured. */
  private tickSurvivalProducer(): void {
    if (this.gameOver) return;
    if (!this.config.garbage.enabled) return;
    const survival = this.config.garbage.survival;
    if (!survival) return;
    if (survival.intervalsMs.length === 0) return;
    const linesPerEvent = Math.max(1, Math.floor(survival.linesPerEvent));
    let intervalMs = this.survivalIntervalMsAt(survival, this.survivalLastEnqueueMs);
    while (intervalMs > 0 && this.elapsedMs - this.survivalLastEnqueueMs >= intervalMs) {
      this.survivalLastEnqueueMs += intervalMs;
      this.enqueueGarbage(linesPerEvent);
      intervalMs = this.survivalIntervalMsAt(survival, this.survivalLastEnqueueMs);
    }
  }

  private survivalIntervalMsAt(survival: NonNullable<GameConfig["garbage"]["survival"]>, elapsedMs: number): number {
    const tiers = survival.intervalsMs;
    if (tiers.length === 0) return 0;
    const tierDuration = Math.max(1, survival.tierDurationMs);
    const idx = Math.min(tiers.length - 1, Math.max(0, Math.floor(elapsedMs / tierDuration)));
    return Math.max(1, tiers[idx]);
  }

  /** Returns the current per-tier interval based on `elapsedMs`; the last interval holds forever. */
  private currentSurvivalIntervalMs(survival: NonNullable<GameConfig["garbage"]["survival"]>): number {
    return this.survivalIntervalMsAt(survival, this.elapsedMs);
  }

  private getSurvivalSnapshot(): SurvivalSnapshot | null {
    const survival = this.config.garbage.survival;
    if (!survival || !this.config.garbage.enabled) return null;
    if (survival.intervalsMs.length === 0) return null;
    const intervalMs = this.currentSurvivalIntervalMs(survival);
    const sinceLast = this.elapsedMs - this.survivalLastEnqueueMs;
    const msUntilNext = Math.max(0, intervalMs - sinceLast);
    return {
      active: !this.gameOver,
      intervalMs,
      linesPerEvent: Math.max(1, Math.floor(survival.linesPerEvent)),
      msUntilNext,
    };
  }

  private currentGravityIntervalMs(): number {
    return getGravityIntervalMs(this.level, this.config);
  }

  /** Spawn next queue piece at the current entry side, including the hidden spawn pad. */
  private spawn(): void {
    if (this.gameOver) return;
    this.clearLastRotation();
    this.clearLockDelayState();
    const s = getSpawnCoords(this.playWidth, this.playHeight, this.spawnPad, this.board.rotation);
    const piece = this.queue.consumeNext(s.x, s.y);
    if (!this.canMovePiece(piece, 0, 0)) {
      this.endGame();
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

  private endGame(): void {
    this.gameOver = true;
    this.activePiece = null;
  }
}

export { Game };
