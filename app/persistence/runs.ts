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
});

export { buildRunInsert };
