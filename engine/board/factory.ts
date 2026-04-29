import { RingBoard } from "./ring";
import type { BoardModel } from "./types";

type BoardKind = "ring";

/** Central creation point for selectable board implementations. */
const createBoard = (kind: BoardKind, width: number, height: number): BoardModel => {
  switch (kind) {
    case "ring":
    default:
      return new RingBoard(width, height);
  }
};

export { createBoard };
export type { BoardKind };
