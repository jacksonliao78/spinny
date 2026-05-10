import type { BoardCell } from "@game/board/types";
import type { GameSnapshot } from "@game/game";
import type { PieceType } from "@game/piece";

type MultiplayerCell = {
  x: number;
  y: number;
  value: PieceType | "solid";
};

type MultiplayerSnapshotPayload = {
  version: 1;
  roomId: string;
  userId: string;
  username: string;
  sentAt: number;
  width: number;
  height: number;
  score: number;
  lines: number;
  incomingGarbage: number;
  hold: PieceType | null;
  next: PieceType[];
  gameOver: boolean;
  cells: MultiplayerCell[];
};

const isBroadcastCell = (cell: BoardCell): cell is PieceType | "solid" => cell !== null;

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
    version: 1,
    roomId,
    userId,
    username,
    sentAt,
    width: snap.width,
    height: snap.height,
    score: snap.score,
    lines: snap.linesClearedTotal,
    incomingGarbage: snap.incomingGarbage,
    hold: snap.hold,
    next: snap.next,
    gameOver: snap.gameOver,
    cells: [...cells.values()],
  };
};

export { buildMultiplayerSnapshot };
export type { MultiplayerCell, MultiplayerSnapshotPayload };
