import type { LocalFfaCombatant, LocalFfaMatch } from "./match";

type LocalBotsCombatantLayout = {
  mode: "player-only" | "side-by-side";
  primary: LocalFfaCombatant;
  opponent: LocalFfaCombatant | null;
  aliveCount: number;
  totalCount: number;
};

const getAliveCombatantsForLayout = (match: LocalFfaMatch): LocalFfaCombatant[] =>
  match.combatants.filter((combatant) => combatant.alive);

const getAliveBotCombatants = (match: LocalFfaMatch): LocalFfaCombatant[] =>
  match.combatants.filter((combatant) => combatant.kind === "bot" && combatant.alive);

const getLocalBotsCombatantLayout = (match: LocalFfaMatch, playerId = "human"): LocalBotsCombatantLayout => {
  const alive = getAliveCombatantsForLayout(match);
  const player = match.combatants.find((combatant) => combatant.id === playerId) ?? match.combatants[0];

  if (alive.length === 1) {
    return {
      mode: "player-only",
      primary: alive[0],
      opponent: null,
      aliveCount: alive.length,
      totalCount: match.combatants.length,
    };
  }

  if (alive.length === 2) {
    const primary = alive.find((combatant) => combatant.id === playerId) ?? alive[0];
    const opponent = alive.find((combatant) => combatant.id !== primary.id) ?? null;
    return {
      mode: "side-by-side",
      primary,
      opponent,
      aliveCount: alive.length,
      totalCount: match.combatants.length,
    };
  }

  return {
    mode: "player-only",
    primary: player,
    opponent: null,
    aliveCount: alive.length,
    totalCount: match.combatants.length,
  };
};

const getVisibleBotCombatant = (match: LocalFfaMatch): LocalFfaCombatant | null => {
  const layout = getLocalBotsCombatantLayout(match);
  return layout.opponent?.kind === "bot" ? layout.opponent : null;
};

export { getAliveBotCombatants, getLocalBotsCombatantLayout, getVisibleBotCombatant };
export type { LocalBotsCombatantLayout };
