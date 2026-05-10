import { RectangularBoard } from "./rectangular";
import { RingBoard } from "./ring";
import type { BoardModel } from "./types";
import type { RandomSource } from "../random";

type BoardKind = "ring" | "rectangular";

/** Central creation point for selectable board implementations. */
const createBoard = (kind: BoardKind, width: number, height: number, random?: RandomSource): BoardModel => {
  switch (kind) {
    case "rectangular":
      return new RectangularBoard(width, height, random);
    case "ring":
    default:
      return new RingBoard(width, height, random);
  }
};

export { createBoard };
export type { BoardKind };
