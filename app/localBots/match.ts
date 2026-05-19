import type { Game, GarbageAttackEvent, RunSummary } from "@game/game";
import type { RandomSource } from "@game/random";

type CombatantKind = "human" | "bot";
type CombatantId = string;

type CombatantController = {
  update: (game: Game, dtMs: number) => void;
};

type LocalFfaCombatant = {
  id: CombatantId;
  name: string;
  kind: CombatantKind;
  game: Game;
  controller: CombatantController | null;
  targetId: CombatantId | null;
  alive: boolean;
  placement: number | null;
  finalSummary: RunSummary | null;
};

type LocalFfaMatch = {
  combatants: LocalFfaCombatant[];
  completed: boolean;
  winnerId: CombatantId | null;
};

type CreateCombatantInput = {
  id: CombatantId;
  name: string;
  kind: CombatantKind;
  game: Game;
  controller?: CombatantController | null;
};

const aliveOpponents = (match: LocalFfaMatch, selfId: CombatantId): LocalFfaCombatant[] =>
  match.combatants.filter((combatant) => combatant.alive && combatant.id !== selfId);

const chooseRandomTargetId = (
  match: LocalFfaMatch,
  selfId: CombatantId,
  random: RandomSource = Math.random,
): CombatantId | null => {
  const candidates = aliveOpponents(match, selfId);
  if (candidates.length === 0) return null;
  const index = Math.floor(Math.max(0, Math.min(0.999999999999, random())) * candidates.length);
  return candidates[index].id;
};

const retargetCombatant = (
  match: LocalFfaMatch,
  combatant: LocalFfaCombatant,
  random: RandomSource = Math.random,
): void => {
  const currentTarget = combatant.targetId
    ? match.combatants.find((candidate) => candidate.id === combatant.targetId)
    : null;
  if (currentTarget?.alive) return;
  combatant.targetId = combatant.alive ? chooseRandomTargetId(match, combatant.id, random) : null;
};

const createLocalFfaMatch = (
  combatants: CreateCombatantInput[],
  random: RandomSource = Math.random,
): LocalFfaMatch => {
  const match: LocalFfaMatch = {
    combatants: combatants.map((combatant) => ({
      id: combatant.id,
      name: combatant.name,
      kind: combatant.kind,
      game: combatant.game,
      controller: combatant.controller ?? null,
      targetId: null,
      alive: !combatant.game.getSnapshot().gameOver,
      placement: null,
      finalSummary: null,
    })),
    completed: false,
    winnerId: null,
  };

  match.combatants.forEach((combatant) => {
    combatant.targetId = chooseRandomTargetId(match, combatant.id, random);
  });
  updateLocalFfaMatchState(match, 0, random);
  return match;
};

const getAliveCombatants = (match: LocalFfaMatch): LocalFfaCombatant[] =>
  match.combatants.filter((combatant) => combatant.alive);

const markCompletedIfNeeded = (match: LocalFfaMatch): void => {
  const alive = getAliveCombatants(match);
  if (alive.length > 1) return;
  match.completed = true;
  match.winnerId = alive[0]?.id ?? null;
  match.combatants.forEach((combatant, index) => {
    if (combatant.placement !== null) return;
    combatant.placement = combatant.alive ? 1 : index + 1;
  });
};

const updateLocalFfaMatchState = (
  match: LocalFfaMatch,
  durationMs: number,
  random: RandomSource = Math.random,
): void => {
  if (match.completed) return;
  match.combatants.forEach((combatant) => {
    if (!combatant.alive) return;
    if (!combatant.game.getSnapshot().gameOver) return;
    combatant.alive = false;
    combatant.targetId = null;
    combatant.finalSummary = combatant.game.getRunSummary(durationMs);
    combatant.placement = getAliveCombatants(match).length + 1;
  });
  match.combatants.forEach((combatant) => retargetCombatant(match, combatant, random));
  markCompletedIfNeeded(match);
};

const routeGarbageAttackEvents = (
  match: LocalFfaMatch,
  attackerId: CombatantId,
  events: GarbageAttackEvent[],
  random: RandomSource = Math.random,
): number => {
  const attacker = match.combatants.find((combatant) => combatant.id === attackerId);
  if (!attacker || !attacker.alive || events.length === 0) return 0;
  retargetCombatant(match, attacker, random);
  const target = attacker.targetId
    ? match.combatants.find((combatant) => combatant.id === attacker.targetId && combatant.alive)
    : null;
  if (!target) return 0;

  const total = events.reduce((sum, event) => sum + Math.max(0, Math.floor(event.amount)), 0);
  if (total <= 0) return 0;
  target.game.enqueueGarbage(total);
  return total;
};

export {
  chooseRandomTargetId,
  createLocalFfaMatch,
  getAliveCombatants,
  routeGarbageAttackEvents,
  updateLocalFfaMatchState,
};
export type {
  CombatantController,
  CombatantId,
  CombatantKind,
  CreateCombatantInput,
  LocalFfaCombatant,
  LocalFfaMatch,
};
