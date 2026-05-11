type MultiplayerResultPayload = {
  version: 1;
  roomId: string;
  loserUserId: string;
  loserUsername: string;
  sentAt: number;
};

const buildMultiplayerResultPayload = (
  roomId: string,
  loserUserId: string,
  loserUsername: string,
  sentAt = Date.now(),
): MultiplayerResultPayload => ({
  version: 1,
  roomId,
  loserUserId,
  loserUsername,
  sentAt,
});

const isMultiplayerResultPayload = (payload: unknown, roomId: string): payload is MultiplayerResultPayload => {
  if (!payload || typeof payload !== "object") return false;
  const maybe = payload as Partial<MultiplayerResultPayload>;
  return (
    maybe.version === 1 &&
    maybe.roomId === roomId &&
    typeof maybe.loserUserId === "string" &&
    maybe.loserUserId.length > 0 &&
    typeof maybe.loserUsername === "string" &&
    maybe.loserUsername.length > 0 &&
    typeof maybe.sentAt === "number" &&
    Number.isFinite(maybe.sentAt)
  );
};

export { buildMultiplayerResultPayload, isMultiplayerResultPayload };
export type { MultiplayerResultPayload };
