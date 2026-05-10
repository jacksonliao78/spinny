import type { BoardKind } from "@game/board/factory";
import type { RunSummary } from "@game/game";
import { GAME_MODE_POLICIES } from "@game/game/rules";
import { MODE_LABELS } from "./constants";

type RunSummaryStat = {
  label: string;
  value: string;
};

type RunSummaryViewModel = {
  headline: string;
  subhead: string;
  primaryLabel: string;
  primaryValue: string;
  stats: RunSummaryStat[];
};

const BOARD_LABELS: Record<BoardKind, string> = {
  rectangular: "Regular",
  ring: "Spinny",
};

const formatRunDuration = (ms: number): string => {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const hundredths = Math.floor((safeMs % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};

const headlineFor = (summary: RunSummary): string => {
  switch (summary.gameMode) {
    case "sprint":
      return "Sprint Complete";
    case "timed":
      return "Time Up";
    case "zen":
      return "Practice Ended";
    case "marathon":
    default:
      return "Run Over";
  }
};

const primaryFor = (summary: RunSummary, durationMs: number): { label: string; value: string } => {
  switch (summary.gameMode) {
    case "timed":
      return { label: "Score", value: String(summary.score) };
    case "sprint":
      return { label: "Time", value: formatRunDuration(durationMs) };
    case "marathon":
      return { label: "Survival Time", value: formatRunDuration(durationMs) };
    case "zen":
    default:
      return { label: "Practice Time", value: formatRunDuration(durationMs) };
  }
};

const buildRunSummaryViewModel = (
  summary: RunSummary,
  durationMs: number,
  boardKind: BoardKind,
): RunSummaryViewModel => {
  const policy = GAME_MODE_POLICIES[summary.gameMode];
  const primary = primaryFor(summary, durationMs);
  const stats: RunSummaryStat[] = [
    { label: "Lines", value: String(summary.linesClearedTotal) },
    { label: "Pieces", value: String(summary.stats.locksPlaced) },
    { label: "PPS", value: summary.metrics.speed.piecesPerSecond.toFixed(2) },
    { label: "Max Combo", value: String(summary.stats.maxCombo) },
    { label: "Holds", value: String(summary.stats.holdUses) },
    { label: "Hard Drop", value: String(summary.stats.hardDropCellsTotal) },
    { label: "Soft Drop", value: String(summary.stats.softDropCellsTotal) },
    { label: "T-Spins", value: String(summary.stats.tSpinCount) },
    { label: "All-Spins", value: String(summary.stats.allSpinCount) },
  ];

  if (policy.showsScore && summary.gameMode !== "timed") {
    stats.splice(1, 0, { label: "Score", value: String(summary.score) });
  }
  if (policy.showsLevel) {
    stats.splice(2, 0, { label: "Level", value: String(summary.level) });
  }

  return {
    headline: headlineFor(summary),
    subhead: `${MODE_LABELS[summary.gameMode]} / ${BOARD_LABELS[boardKind]}`,
    primaryLabel: primary.label,
    primaryValue: primary.value,
    stats,
  };
};

export { buildRunSummaryViewModel, formatRunDuration };
export type { RunSummaryStat, RunSummaryViewModel };
