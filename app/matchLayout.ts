type MatchLayoutParticipant = {
  id: string;
  alive: boolean;
};

type MatchCombatantLayout<T extends MatchLayoutParticipant> = {
  mode: "player-only" | "side-by-side";
  primary: T;
  opponent: T | null;
  aliveCount: number;
  totalCount: number;
};

const getAliveParticipants = <T extends MatchLayoutParticipant>(participants: T[]): T[] =>
  participants.filter((participant) => participant.alive);

const chooseSelfOrFirst = <T extends MatchLayoutParticipant>(participants: T[], selfId: string): T => {
  const self = participants.find((participant) => participant.id === selfId);
  if (self) return self;
  const first = participants[0];
  if (!first) throw new Error("Cannot choose a match layout participant from an empty list");
  return first;
};

const getMatchCombatantLayout = <T extends MatchLayoutParticipant>(
  participants: T[],
  selfId: string,
): MatchCombatantLayout<T> => {
  const alive = getAliveParticipants(participants);

  if (alive.length === 1) {
    return {
      mode: "player-only",
      primary: alive[0],
      opponent: null,
      aliveCount: alive.length,
      totalCount: participants.length,
    };
  }

  if (alive.length === 2) {
    const primary = alive.find((participant) => participant.id === selfId) ?? alive[0];
    const opponent = alive.find((participant) => participant.id !== primary.id) ?? null;
    return {
      mode: "side-by-side",
      primary,
      opponent,
      aliveCount: alive.length,
      totalCount: participants.length,
    };
  }

  return {
    mode: "player-only",
    primary: chooseSelfOrFirst(participants, selfId),
    opponent: null,
    aliveCount: alive.length,
    totalCount: participants.length,
  };
};

export { getAliveParticipants, getMatchCombatantLayout };
export type { MatchCombatantLayout, MatchLayoutParticipant };
