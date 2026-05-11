type MultiplayerAttackPayload = {
  version: 1;
  roomId: string;
  attackerUserId: string;
  attackId: string;
  amount: number;
  sentAt: number;
};

type AttackDeduper = {
  accept: (attackId: string) => boolean;
  reset: () => void;
};

const MAX_ATTACK_AMOUNT = 200;

const buildMultiplayerAttackPayload = (
  roomId: string,
  attackerUserId: string,
  sequence: number,
  amount: number,
  sentAt = Date.now(),
): MultiplayerAttackPayload => ({
  version: 1,
  roomId,
  attackerUserId,
  attackId: `${attackerUserId}:${Math.max(0, Math.floor(sequence))}`,
  amount: Math.max(0, Math.floor(amount)),
  sentAt,
});

const isMultiplayerAttackPayload = (payload: unknown, roomId: string): payload is MultiplayerAttackPayload => {
  if (!payload || typeof payload !== "object") return false;
  const maybe = payload as Partial<MultiplayerAttackPayload>;
  return (
    maybe.version === 1 &&
    maybe.roomId === roomId &&
    typeof maybe.attackerUserId === "string" &&
    maybe.attackerUserId.length > 0 &&
    typeof maybe.attackId === "string" &&
    maybe.attackId.length > 0 &&
    typeof maybe.amount === "number" &&
    Number.isInteger(maybe.amount) &&
    maybe.amount > 0 &&
    maybe.amount <= MAX_ATTACK_AMOUNT &&
    typeof maybe.sentAt === "number" &&
    Number.isFinite(maybe.sentAt)
  );
};

const createAttackDeduper = (): AttackDeduper => {
  const seen = new Set<string>();
  return {
    accept: (attackId) => {
      if (seen.has(attackId)) return false;
      seen.add(attackId);
      return true;
    },
    reset: () => seen.clear(),
  };
};

const applyRemoteGarbageAttack = (
  payload: unknown,
  roomId: string,
  selfUserId: string | null | undefined,
  deduper: AttackDeduper,
  enqueueGarbage: (amount: number) => void,
): boolean => {
  if (!isMultiplayerAttackPayload(payload, roomId)) return false;
  if (payload.attackerUserId === selfUserId) return false;
  if (!deduper.accept(payload.attackId)) return false;
  enqueueGarbage(payload.amount);
  return true;
};

export { applyRemoteGarbageAttack, buildMultiplayerAttackPayload, createAttackDeduper, isMultiplayerAttackPayload };
export type { AttackDeduper, MultiplayerAttackPayload };
