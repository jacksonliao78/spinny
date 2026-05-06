import type { BoardKind } from "@game/board/factory";
import type { RunSummary } from "@game/game";

const buildRunInsert = (userId: string, summary: RunSummary, durationMs: number, boardType: BoardKind) => ({
  user_id: userId,
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

export { buildRunInsert };
