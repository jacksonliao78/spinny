import { RectangularBoard } from "./rectangular";
import { RingBoard } from "./ring";
import type { BoardModel } from "./types";

type BoardKind = "ring" | "rectangular";

/** Central creation point for selectable board implementations. */
const createBoard = (kind: BoardKind, width: number, height: number): BoardModel => {
  switch (kind) {
    case "rectangular":
      return new RectangularBoard(width, height);
    case "ring":
    default:
      return new RingBoard(width, height);
  }
};

export { createBoard };
export type { BoardKind };
