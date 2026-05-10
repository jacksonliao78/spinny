import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import { MODE_LABELS } from "./constants";

type SavedRunRow = {
  mode: GameMode | string | null;
  finished_at?: string | null;
  score?: number | null;
  lines?: number | null;
  level?: number | null;
  duration_ms?: number | null;
  board_type: BoardKind | string | null;
  pieces?: number | null;
  holds?: number | null;
  hard_drop_cells?: number | null;
  soft_drop_cells?: number | null;
  max_combo?: number | null;
  quads?: number | null;
  tspin_minis?: number | null;
  tspin_singles?: number | null;
  tspin_doubles?: number | null;
  tspin_triples?: number | null;
  allspins?: number | null;
};

type PlayerAccountInfo = {
  username: string | null;
  email: string | null;
  createdAt: string | null;
};

type PlayerStat = {
  label: string;
  value: string;
};

type PlayerBest = {
  label: string;
  value: string;
  detail: string;
};

type PlayerStatsViewModel = {
  account: PlayerStat[];
  headline: PlayerStat[];
  bests: PlayerBest[];
  activity: PlayerStat[];
  hasRuns: boolean;
};

const BOARD_LABELS: Record<BoardKind, string> = {
  rectangular: "Regular",
  ring: "Spinny",
};

const numberValue = (value: number | null | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
};

const formatInteger = (value: number): string => Math.max(0, Math.round(value)).toLocaleString("en-US");

const formatDate = (value: string | null): string => {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatPlaytime = (ms: number): string => {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatDuration = (ms: number): string => {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const hundredths = Math.floor((safeMs % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};

const modeLabel = (mode: SavedRunRow["mode"]): string => {
  if (mode === "timed" || mode === "marathon" || mode === "sprint" || mode === "zen") {
    return MODE_LABELS[mode];
  }
  return "Run";
};

const boardLabel = (board: SavedRunRow["board_type"]): string => {
  if (board === "rectangular" || board === "ring") return BOARD_LABELS[board];
  return "Board";
};

const runDetail = (run: SavedRunRow): string => `${modeLabel(run.mode)} / ${boardLabel(run.board_type)}`;

const betterScore = (best: SavedRunRow | null, next: SavedRunRow): SavedRunRow => {
  if (!best) return next;
  return numberValue(next.score) > numberValue(best.score) ? next : best;
};

const longerDuration = (best: SavedRunRow | null, next: SavedRunRow): SavedRunRow => {
  if (!best) return next;
  return numberValue(next.duration_ms) > numberValue(best.duration_ms) ? next : best;
};

const shorterDuration = (best: SavedRunRow | null, next: SavedRunRow): SavedRunRow => {
  if (!best) return next;
  return numberValue(next.duration_ms) < numberValue(best.duration_ms) ? next : best;
};

const buildPlayerStatsViewModel = (account: PlayerAccountInfo, rows: SavedRunRow[]): PlayerStatsViewModel => {
  let totalDurationMs = 0;
  let totalLines = 0;
  let totalPieces = 0;
  let totalHolds = 0;
  let totalHardDropCells = 0;
  let totalSoftDropCells = 0;
  let totalQuads = 0;
  let totalTSpins = 0;
  let totalAllSpins = 0;
  let maxCombo = 0;

  let bestOverallScore: SavedRunRow | null = null;
  let bestTimedScore: SavedRunRow | null = null;
  let bestSprintTime: SavedRunRow | null = null;
  let bestMarathonTime: SavedRunRow | null = null;
  let bestMarathonLines: SavedRunRow | null = null;

  for (const row of rows) {
    totalDurationMs += numberValue(row.duration_ms);
    totalLines += numberValue(row.lines);
    totalPieces += numberValue(row.pieces);
    totalHolds += numberValue(row.holds);
    totalHardDropCells += numberValue(row.hard_drop_cells);
    totalSoftDropCells += numberValue(row.soft_drop_cells);
    totalQuads += numberValue(row.quads);
    totalTSpins +=
      numberValue(row.tspin_minis) +
      numberValue(row.tspin_singles) +
      numberValue(row.tspin_doubles) +
      numberValue(row.tspin_triples);
    totalAllSpins += numberValue(row.allspins);
    maxCombo = Math.max(maxCombo, numberValue(row.max_combo));

    bestOverallScore = betterScore(bestOverallScore, row);
    if (row.mode === "timed") bestTimedScore = betterScore(bestTimedScore, row);
    if (row.mode === "sprint") bestSprintTime = shorterDuration(bestSprintTime, row);
    if (row.mode === "marathon") {
      bestMarathonTime = longerDuration(bestMarathonTime, row);
      bestMarathonLines = !bestMarathonLines || numberValue(row.lines) > numberValue(bestMarathonLines.lines) ? row : bestMarathonLines;
    }
  }

  const bests: PlayerBest[] = [
    {
      label: "Best Timed Score",
      value: bestTimedScore ? formatInteger(numberValue(bestTimedScore.score)) : "None",
      detail: bestTimedScore ? boardLabel(bestTimedScore.board_type) : "Play Timed to set one",
    },
    {
      label: "Best Sprint Time",
      value: bestSprintTime ? formatDuration(numberValue(bestSprintTime.duration_ms)) : "None",
      detail: bestSprintTime ? boardLabel(bestSprintTime.board_type) : "Play Sprint to set one",
    },
    {
      label: "Best Marathon Time",
      value: bestMarathonTime ? formatDuration(numberValue(bestMarathonTime.duration_ms)) : "None",
      detail: bestMarathonTime ? boardLabel(bestMarathonTime.board_type) : "Play Marathon to set one",
    },
    {
      label: "Best Marathon Lines",
      value: bestMarathonLines ? formatInteger(numberValue(bestMarathonLines.lines)) : "None",
      detail: bestMarathonLines ? boardLabel(bestMarathonLines.board_type) : "Play Marathon to set one",
    },
    {
      label: "Best Overall Score",
      value: bestOverallScore ? formatInteger(numberValue(bestOverallScore.score)) : "None",
      detail: bestOverallScore ? runDetail(bestOverallScore) : "Score a saved run",
    },
  ];

  return {
    account: [
      { label: "Username", value: account.username ?? "Unknown" },
      { label: "Email", value: account.email ?? "Unknown" },
      { label: "Joined", value: formatDate(account.createdAt) },
    ],
    headline: [
      { label: "Runs", value: formatInteger(rows.length) },
      { label: "Playtime", value: formatPlaytime(totalDurationMs) },
      { label: "Lines", value: formatInteger(totalLines) },
      { label: "Pieces", value: formatInteger(totalPieces) },
    ],
    bests,
    activity: [
      { label: "Max Combo", value: formatInteger(maxCombo) },
      { label: "Holds", value: formatInteger(totalHolds) },
      { label: "Hard Drop Cells", value: formatInteger(totalHardDropCells) },
      { label: "Soft Drop Cells", value: formatInteger(totalSoftDropCells) },
      { label: "Quads", value: formatInteger(totalQuads) },
      { label: "T-Spins", value: formatInteger(totalTSpins) },
      { label: "All-Spins", value: formatInteger(totalAllSpins) },
    ],
    hasRuns: rows.length > 0,
  };
};

export { buildPlayerStatsViewModel, formatDuration, formatPlaytime };
export type { PlayerAccountInfo, PlayerBest, PlayerStat, PlayerStatsViewModel, SavedRunRow };
