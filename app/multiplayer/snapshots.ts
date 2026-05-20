import type { BoardCell } from "@game/board/types";
import type { GameSnapshot } from "@game/game";
import type { PieceType } from "@game/piece";

type MultiplayerCell = {
  x: number;
  y: number;
  value: PieceType | "solid";
};

type MultiplayerSnapshotPayload = {
  version: 3;
  roomId: string;
  userId: string;
  username: string;
  slot: 1 | 2;
  sentAt: number;
  width: number;
  height: number;
  fullWidth: number;
  fullHeight: number;
  viewOffsetX: number;
  viewOffsetY: number;
  score: number;
  lines: number;
  pieces: number;
  pps: number;
  incomingGarbage: number;
  hold: PieceType | null;
  next: PieceType[];
  gameOver: boolean;
  cells: MultiplayerCell[];
};

const isBroadcastCell = (cell: BoardCell): cell is PieceType | "solid" => cell !== null;

const isPieceType = (value: unknown): value is PieceType =>
  value === "I" || value === "J" || value === "L" || value === "O" || value === "S" || value === "T" || value === "Z";

const isMultiplayerCell = (value: unknown): value is MultiplayerCell => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<MultiplayerCell>;
  return (
    typeof maybe.x === "number" &&
    typeof maybe.y === "number" &&
    (maybe.value === "solid" || isPieceType(maybe.value))
  );
};

const isMultiplayerSnapshotPayload = (payload: unknown, roomId: string): payload is MultiplayerSnapshotPayload => {
  if (!payload || typeof payload !== "object") return false;
  const maybe = payload as Partial<MultiplayerSnapshotPayload>;
  return (
    maybe.version === 3 &&
    maybe.roomId === roomId &&
    typeof maybe.userId === "string" &&
    typeof maybe.username === "string" &&
    (maybe.slot === 1 || maybe.slot === 2) &&
    typeof maybe.sentAt === "number" &&
    Number.isFinite(maybe.sentAt) &&
    typeof maybe.width === "number" &&
    typeof maybe.height === "number" &&
    typeof maybe.fullWidth === "number" &&
    typeof maybe.fullHeight === "number" &&
    typeof maybe.viewOffsetX === "number" &&
    typeof maybe.viewOffsetY === "number" &&
    typeof maybe.score === "number" &&
    typeof maybe.lines === "number" &&
    typeof maybe.pieces === "number" &&
    Number.isFinite(maybe.pieces) &&
    typeof maybe.pps === "number" &&
    Number.isFinite(maybe.pps) &&
    typeof maybe.incomingGarbage === "number" &&
    (maybe.hold === null || isPieceType(maybe.hold)) &&
    Array.isArray(maybe.next) &&
    maybe.next.every(isPieceType) &&
    typeof maybe.gameOver === "boolean" &&
    Array.isArray(maybe.cells) &&
    maybe.cells.every(isMultiplayerCell)
  );
};

const addCell = (
  cells: Map<string, MultiplayerCell>,
  x: number,
  y: number,
  value: PieceType | "solid",
  width: number,
  height: number,
): void => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  cells.set(`${x},${y}`, { x, y, value });
};

const buildMultiplayerSnapshot = (
  roomId: string,
  userId: string,
  username: string,
  slot: 1 | 2,
  snap: GameSnapshot,
  sentAt = Date.now(),
): MultiplayerSnapshotPayload => {
  const cells = new Map<string, MultiplayerCell>();
  const offsetX = snap.viewOffsetX;
  const offsetY = snap.viewOffsetY;

  for (let y = 0; y < snap.height; y += 1) {
    for (let x = 0; x < snap.width; x += 1) {
      const cell = snap.locked[y + offsetY]?.[x + offsetX] ?? null;
      if (isBroadcastCell(cell)) addCell(cells, x, y, cell, snap.width, snap.height);
    }
  }

  if (snap.active) {
    const shape = snap.active.getShape(snap.active.rotation);
    for (const [rowIdx, row] of shape.entries()) {
      for (const [colIdx, occupied] of row.entries()) {
        if (!occupied) continue;
        addCell(
          cells,
          snap.active.x + colIdx - offsetX,
          snap.active.y + rowIdx - offsetY,
          snap.active.type,
          snap.width,
          snap.height,
        );
      }
    }
  }

  return {
    version: 3,
    roomId,
    userId,
    username,
    slot,
    sentAt,
    width: snap.width,
    height: snap.height,
    fullWidth: snap.locked[0]?.length ?? snap.width,
    fullHeight: snap.locked.length,
    viewOffsetX: snap.viewOffsetX,
    viewOffsetY: snap.viewOffsetY,
    score: snap.score,
    lines: snap.linesClearedTotal,
    pieces: snap.piecesPlaced,
    pps: snap.piecesPerSecond,
    incomingGarbage: snap.incomingGarbage,
    hold: snap.hold,
    next: snap.next,
    gameOver: snap.gameOver,
    cells: [...cells.values()],
  };
};

export { buildMultiplayerSnapshot, isMultiplayerCell, isMultiplayerSnapshotPayload };
export type { MultiplayerCell, MultiplayerSnapshotPayload };
