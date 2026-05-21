import { getAliveParticipants, getMatchCombatantLayout, type MatchCombatantLayout } from "../matchLayout";
import type { LocalFfaCombatant, LocalFfaMatch } from "./match";

type LocalBotsCombatantLayout = MatchCombatantLayout<LocalFfaCombatant>;

const getAliveCombatantsForLayout = (match: LocalFfaMatch): LocalFfaCombatant[] =>
  getAliveParticipants(match.combatants);

const getAliveBotCombatants = (match: LocalFfaMatch): LocalFfaCombatant[] =>
  match.combatants.filter((combatant) => combatant.kind === "bot" && combatant.alive);

const getLocalBotsCombatantLayout = (match: LocalFfaMatch, playerId = "human"): LocalBotsCombatantLayout =>
  getMatchCombatantLayout(match.combatants, playerId);

const getVisibleBotCombatant = (match: LocalFfaMatch): LocalFfaCombatant | null => {
  const layout = getLocalBotsCombatantLayout(match);
  return layout.opponent?.kind === "bot" ? layout.opponent : null;
};

export { getAliveBotCombatants, getLocalBotsCombatantLayout, getVisibleBotCombatant };
export type { LocalBotsCombatantLayout };
