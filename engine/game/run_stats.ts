import type { PieceType } from "../piece";
import type { RunStats } from "./types";

type PieceCounts = Record<PieceType, number>;

type LineClearCounts = {
  zero: number;
  single: number;
  double: number;
  triple: number;
  quadPlus: number;
};

const createPieceCounts = (): PieceCounts => ({
  I: 0,
  J: 0,
  L: 0,
  O: 0,
  S: 0,
  T: 0,
  Z: 0,
});

const createLineClearCounts = (): LineClearCounts => ({
  zero: 0,
  single: 0,
  double: 0,
  triple: 0,
  quadPlus: 0,
});

export const createRunStats = (): RunStats => ({
  locksPlaced: 0,
  piecesByType: createPieceCounts(),
  lineClearsByCount: createLineClearCounts(),
  maxCombo: 0,
  b2bChain: 0,
  b2bMaxChain: 0,
  hardDropCellsTotal: 0,
  softDropCellsTotal: 0,
  holdUses: 0,
  tSpinCount: 0,
  tSpinMiniCount: 0,
  tSpinSingles: 0,
  tSpinDoubles: 0,
  tSpinTriples: 0,
  allSpinCount: 0,
  garbageReceivedEvents: 0,
  garbageReceivedTotal: 0,
  garbageAppliedTotal: 0,
});

export const cloneRunStats = (stats: RunStats): RunStats => ({
  ...stats,
  piecesByType: { ...stats.piecesByType },
  lineClearsByCount: { ...stats.lineClearsByCount },
});

