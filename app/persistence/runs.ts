import type { BoardKind } from "@game/board/factory";
import type { RunSummary } from "@game/game";

const buildRunInsert = (
  userId: string,
  summary: RunSummary,
  durationMs: number,
  boardType: BoardKind,
  finishedAt = new Date(),
) => ({
  user_id: userId,
  finished_at: finishedAt.toISOString(),
  mode: summary.gameMode,
  score: summary.score,
  lines: summary.linesClearedTotal,
  level: summary.level,
  duration_ms: Math.max(0, Math.round(durationMs)),
  board_width: summary.width,
  board_height: summary.height,
  board_type: boardType,

  // Advanced per-run stats (raw counts; derive rates like PPS in queries)
  pieces: summary.stats.locksPlaced,
  holds: summary.stats.holdUses,
  hard_drop_cells: summary.stats.hardDropCellsTotal,
  soft_drop_cells: summary.stats.softDropCellsTotal,
  max_combo: summary.stats.maxCombo,

  zeros: summary.stats.lineClearsByCount.zero,
  singles: summary.stats.lineClearsByCount.single,
  doubles: summary.stats.lineClearsByCount.double,
  triples: summary.stats.lineClearsByCount.triple,
  quads: summary.stats.lineClearsByCount.quadPlus,

  tspin_minis: summary.stats.tSpinMiniCount,
  tspin_singles: summary.stats.tSpinSingles,
  tspin_doubles: summary.stats.tSpinDoubles,
  tspin_triples: summary.stats.tSpinTriples,

  allspins: summary.stats.allSpinCount,
});

const buildCoreRunInsert = (
  userId: string,
  summary: RunSummary,
  durationMs: number,
  boardType: BoardKind,
  finishedAt = new Date(),
) => ({
  user_id: userId,
  finished_at: finishedAt.toISOString(),
  mode: summary.gameMode,
  score: summary.score,
  lines: summary.linesClearedTotal,
  level: summary.level,
  duration_ms: Math.max(0, Math.round(durationMs)),
  board_width: summary.width,
  board_height: summary.height,
  board_type: boardType,
});

const isMissingRunColumnError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";
  const details = typeof maybeError.details === "string" ? maybeError.details.toLowerCase() : "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("column") ||
    details.includes("column")
  );
};

export { buildCoreRunInsert, buildRunInsert, isMissingRunColumnError };
