import type { BoardKind } from "@game/board/factory";
import type { RunSummary } from "@game/game";
import { buildRunSummaryViewModel } from "../runSummary";
import type { MultiplayerSnapshotPayload } from "./snapshots";

type MatchSummaryStat = {
  label: string;
  value: string;
};

type MatchResultViewModel = {
  headline: string;
  subhead: string;
  primaryLabel: string;
  primaryValue: string;
  stats: MatchSummaryStat[];
  outcome: "win" | "loss";
};

type SpectatorPlayerNames = Record<1 | 2, string>;

const buildPlayerMatchResultViewModel = (
  won: boolean,
  summary: RunSummary,
  durationMs: number,
  boardKind: BoardKind,
  opponent: MultiplayerSnapshotPayload | null,
): MatchResultViewModel => {
  const base = buildRunSummaryViewModel(summary, durationMs, boardKind);
  return {
    headline: won ? "You Win" : "You Lose",
    subhead: base.subhead,
    primaryLabel: "Result",
    primaryValue: won ? "Winner" : "Knocked Out",
    outcome: won ? "win" : "loss",
    stats: [
      { label: "Your Lines", value: String(summary.linesClearedTotal) },
      { label: "Your Score", value: String(summary.score) },
      { label: "Pieces", value: String(summary.stats.locksPlaced) },
      { label: "PPS", value: summary.metrics.speed.piecesPerSecond.toFixed(2) },
      { label: "Opponent Lines", value: String(opponent?.lines ?? 0) },
      { label: "Opponent Score", value: String(opponent?.score ?? 0) },
      { label: "Opponent PPS", value: (opponent?.pps ?? 0).toFixed(2) },
    ],
  };
};

const buildSpectatorMatchResultViewModel = (
  loserUserId: string,
  loserUsername: string,
  left: MultiplayerSnapshotPayload | null,
  right: MultiplayerSnapshotPayload | null,
  playerNames: SpectatorPlayerNames,
): MatchResultViewModel => {
  const loser = left?.userId === loserUserId ? left : right?.userId === loserUserId ? right : null;
  const winner = loser?.slot === 1 ? right : loser?.slot === 2 ? left : null;
  const fallbackWinnerSlot = left?.userId === loserUserId ? 2 : right?.userId === loserUserId ? 1 : null;
  const winnerName = winner?.username ?? (fallbackWinnerSlot ? playerNames[fallbackWinnerSlot] : "Winner");
  const loserName = loser?.username ?? loserUsername;

  return {
    headline: `${winnerName} Wins`,
    subhead: "Versus / Spectating",
    primaryLabel: "Knocked Out",
    primaryValue: loserName,
    outcome: "win",
    stats: [
      { label: "P1 Lines", value: String(left?.lines ?? 0) },
      { label: "P1 Score", value: String(left?.score ?? 0) },
      { label: "P1 PPS", value: (left?.pps ?? 0).toFixed(2) },
      { label: "P2 Lines", value: String(right?.lines ?? 0) },
      { label: "P2 Score", value: String(right?.score ?? 0) },
      { label: "P2 PPS", value: (right?.pps ?? 0).toFixed(2) },
    ],
  };
};

export { buildPlayerMatchResultViewModel, buildSpectatorMatchResultViewModel };
export type { MatchResultViewModel, MatchSummaryStat, SpectatorPlayerNames };
