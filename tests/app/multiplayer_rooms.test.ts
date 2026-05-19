import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRoomSettings,
  canStartRoom,
  createJoinCode,
  getPlayerMembers,
  getSpectatorMembers,
  normalizeJoinCode,
  type MultiplayerRoom,
  type RoomMember,
} from "../../app/multiplayer/rooms";

test("normalizeJoinCode uppercases and strips separators", () => {
  assert.equal(normalizeJoinCode(" ab-c 12 "), "ABC12");
});

test("createJoinCode creates compact uppercase room codes", () => {
  const code = createJoinCode(() => 0);

  assert.equal(code.length, 6);
  assert.match(code, /^[A-Z2-9]+$/);
});

test("buildRoomSettings keeps multiplayer rectangular-only", () => {
  assert.deepEqual(buildRoomSettings(), { boardKind: "rectangular" });
  assert.deepEqual(buildRoomSettings({ boardKind: "rectangular" }), { boardKind: "rectangular" });
});

const room: MultiplayerRoom = {
  id: "room-1",
  joinCode: "ABC123",
  visibility: "public",
  status: "lobby",
  hostUserId: "user-1",
  maxPlayers: 2,
  settings: { boardKind: "rectangular" },
  seed: null,
  countdownStartsAt: null,
  memberCount: 3,
  playerCount: 2,
  spectatorCount: 1,
  createdAt: "now",
  updatedAt: "now",
};

const member = (userId: string, slot: 1 | 2 | null, ready: boolean): RoomMember => ({
  roomId: "room-1",
  userId,
  username: userId,
  role: slot === null ? "spectator" : "player",
  slot,
  ready,
  connected: true,
  joinedAt: "now",
  lastSeenAt: "now",
});

test("room member helpers separate players from spectators", () => {
  const members = [member("watcher", null, false), member("user-2", 2, true), member("user-1", 1, true)];

  assert.deepEqual(getPlayerMembers(members).map((next) => next.userId), ["user-1", "user-2"]);
  assert.deepEqual(getSpectatorMembers(members).map((next) => next.userId), ["watcher"]);
});

test("canStartRoom ignores spectators for readiness", () => {
  assert.equal(canStartRoom(room, [member("user-1", 1, true), member("user-2", 2, true), member("watcher", null, false)]), true);
  assert.equal(canStartRoom(room, [member("user-1", 1, true), member("watcher", null, false)]), false);
  assert.equal(canStartRoom(room, [member("user-1", 1, true), member("user-2", 2, false)]), false);
});
