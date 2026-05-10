import assert from "node:assert/strict";
import test from "node:test";
import { Piece } from "../../engine/piece";
import { buildMultiplayerSnapshot } from "../../app/multiplayer/snapshots";
import type { GameSnapshot } from "../../engine/game";

const makeSnapshot = (): GameSnapshot => ({
  width: 4,
  height: 4,
  viewOffsetX: 1,
  viewOffsetY: 1,
  boardRotation: 0,
  locked: [
    [null, null, null, null, null, null],
    [null, "I", null, null, null, null],
    [null, null, "solid", null, null, null],
    [null, null, null, null, null, null],
    [null, null, null, null, null, null],
    [null, null, null, null, null, null],
  ],
  active: new Piece("T", 2, 2),
  next: ["I", "O", "T", "S", "Z"],
  hold: null,
  score: 1200,
  level: 1,
  combo: 0,
  b2b: 0,
  linesClearedTotal: 3,
  garbageEnabled: true,
  incomingGarbage: 2,
  survival: null,
  gameMode: "versus",
  remainingMs: null,
  elapsedMs: 5000,
  sprintTargetClears: 40,
  gravityIntervalMs: 1000,
  lastSpin: null,
  gameOver: false,
});

test("buildMultiplayerSnapshot exports visible cells and active piece", () => {
  const payload = buildMultiplayerSnapshot("room-1", "user-1", "player", makeSnapshot(), 123);

  assert.equal(payload.version, 2);
  assert.equal(payload.roomId, "room-1");
  assert.equal(payload.width, 4);
  assert.equal(payload.height, 4);
  assert.equal(payload.lines, 3);
  assert.equal(payload.incomingGarbage, 2);
  assert.equal(payload.hold, null);
  assert.deepEqual(payload.next, ["I", "O", "T", "S", "Z"]);
  assert.equal(payload.sentAt, 123);
  assert(payload.cells.some((cell) => cell.x === 0 && cell.y === 0 && cell.value === "I"));
  assert(payload.cells.some((cell) => cell.x === 1 && cell.y === 1 && cell.value === "solid"));
  assert(payload.cells.some((cell) => cell.value === "T"));
});
