import type { BoardCell, BoardFactory } from "../board/types";
import type { PieceType } from "../piece";
import type { Piece } from "../piece";
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
  gameMode: GameMode;
  remainingMs: number | null;
  elapsedMs: number;
  sprintTargetClears: number;
  gravityIntervalMs: number;
  lastSpin: SpinResult | null;
  gameOver: boolean;
};

export type GameOptions = {
  /** Optional board implementation, mainly for alternate board types and tests. */
  boardFactory?: BoardFactory;
  /** Partial gameplay tuning merged with DEFAULT_GAME_CONFIG. */
  config?: GameConfigOverrides;
};

