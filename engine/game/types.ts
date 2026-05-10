import type { BoardCell, BoardFactory } from "../board/types";
import type { PieceType } from "../piece";
import type { Piece } from "../piece";
import type { RandomSource } from "../random";
import type { GameConfigOverrides, GameMode } from "./rules";
import type { SpinResult } from "./rotation";

type PieceCounts = Record<PieceType, number>;

type LineClearCounts = {
  zero: number;
  single: number;
  double: number;
  triple: number;
  quadPlus: number;
};

export type RunStats = {
  locksPlaced: number;
  piecesByType: PieceCounts;
  lineClearsByCount: LineClearCounts;
  maxCombo: number;
  b2bChain: number;
  b2bMaxChain: number;
  hardDropCellsTotal: number;
  softDropCellsTotal: number;
  holdUses: number;
  tSpinCount: number;
  tSpinMiniCount: number;
  tSpinSingles: number;
  tSpinDoubles: number;
  tSpinTriples: number;
  allSpinCount: number;
  garbageReceivedEvents: number;
  garbageReceivedTotal: number;
  garbageAppliedTotal: number;
};

export type RunSpeedMetrics = {
  durationMs: number;
  piecesPerSecond: number;
};

export type RunAttackMetrics = {
  attackTotal: number;
  attacksPerMinute: number;
  attackPerPiece: number;
};

export type RunBackToBackMetrics = {
  chain: number;
  maxChain: number;
  multiplier: number;
};

export type RunMetrics = {
  speed: RunSpeedMetrics;
  attack: RunAttackMetrics;
  backToBack: RunBackToBackMetrics;
};

export type RunSummary = {
  width: number;
  height: number;
  gameMode: GameMode;
  score: number;
  level: number;
  linesClearedTotal: number;
  remainingMs: number | null;
  gameOver: boolean;
  stats: RunStats;
  metrics: RunMetrics;
};

/** Read-only frame data consumed by the renderer and UI; active remains mutable game state. */
export type GameSnapshot = {
  width: number;
  height: number;
  viewOffsetX: number;
  viewOffsetY: number;
  /** 0–3: how many quarter-turns the playfield has taken (gravity cycles with this). */
  boardRotation: number;
  locked: BoardCell[][];
  active: Piece | null;
  next: PieceType[];
  hold: PieceType | null;
  score: number;
  level: number;
  combo: number;
  b2b: number;
  linesClearedTotal: number;
  garbageEnabled: boolean;
  incomingGarbage: number;
  /** Time-driven garbage producer state when survival is configured; null otherwise. */
  survival: SurvivalSnapshot | null;
  gameMode: GameMode;
  remainingMs: number | null;
  elapsedMs: number;
  sprintTargetClears: number;
  gravityIntervalMs: number;
  lastSpin: SpinResult | null;
  gameOver: boolean;
};

export type SurvivalSnapshot = {
  /** True while the producer is active for this run. */
  active: boolean;
  /** Current per-tier interval between enqueue events (ms). */
  intervalMs: number;
  /** Lines enqueued per scheduled event. */
  linesPerEvent: number;
  /** Time until the next scheduled enqueue, in ms (clamped to >= 0). */
  msUntilNext: number;
};

export type GameOptions = {
  /** Optional board implementation, mainly for alternate board types and tests. */
  boardFactory?: BoardFactory;
  /** Partial gameplay tuning merged with DEFAULT_GAME_CONFIG. */
  config?: GameConfigOverrides;
  /** Optional random source for deterministic queues and board garbage, mainly multiplayer/tests. */
  random?: RandomSource;
  /** When true, leave the first piece in the queue until `beginRun` is called. */
  deferFirstSpawn?: boolean;
};
