import type { LocalFfaCombatant, LocalFfaMatch } from "./match";

const getAliveBotCombatants = (match: LocalFfaMatch): LocalFfaCombatant[] =>
  match.combatants.filter((combatant) => combatant.kind === "bot" && combatant.alive);

const getVisibleBotCombatant = (
  match: LocalFfaMatch,
  initialBotCount: number,
): LocalFfaCombatant | null => {
  const aliveBots = getAliveBotCombatants(match);
  if (initialBotCount === 1) return match.combatants.find((combatant) => combatant.kind === "bot") ?? null;
  return aliveBots.length === 1 ? aliveBots[0] : null;
};

export { getAliveBotCombatants, getVisibleBotCombatant };
