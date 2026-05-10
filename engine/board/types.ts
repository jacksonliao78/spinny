import type { PieceType, Piece } from "../piece";
import type { RandomSource } from "../random";

const SOLID_CELL = "solid";

type SolidCell = typeof SOLID_CELL;
/** A locked board cell: null is empty, a piece type is movable-piece residue, and solid is an immobile obstacle. */
type BoardCell = PieceType | SolidCell | null;

type BoardModel = {
  /** Total board width, including any hidden or non-playable cells the model owns. */
  width: number;
  /** Total board height, including any hidden or non-playable cells the model owns. */
  height: number;
  /** Board orientation index used by render/input logic; ring boards use 0-3 quarter turns. */
  rotation: number;
  /** Advance the board orientation after a piece locks, if this board type rotates. */
  rotate: () => void;
  /** Return the one-cell gravity step as [dx, dy] for the current board orientation. */
  gravityDelta: () => [number, number];
  /** Return the one-cell "move left" step relative to the current gravity direction. */
  lateralLeftDelta: () => [number, number];
  /** Return the one-cell "move right" step relative to the current gravity direction. */
  lateralRightDelta: () => [number, number];
  /** Return an isolated copy of locked cells only; callers must not be able to mutate board state through it. */
  getLockedCopy: () => BoardCell[][];
  /** True if the piece can occupy its current position plus the given offset and rotation without collisions or bounds violations. */
  canPlace: (piece: Piece, rotation: number, offsetX: number, offsetY: number) => boolean;
  /** True when the piece's current contact is a loss condition for this board type. */
  isContactLoss: (piece: Piece) => boolean;
  /** Permanently copy the piece's occupied cells into the locked board state. */
  lockPiece: (piece: Piece) => void;
  /** Clear completed lines/rings according to board rules and return how many were cleared. */
  clearLines: () => number;
  /** Apply up to `rings` garbage rows/rings with `holesPerRing` gaps each; return the amount actually applied. */
  addGarbage: (rings: number, holesPerRing: number) => number;
};

type BoardFactory = (width: number, height: number, random?: RandomSource) => BoardModel;

export { SOLID_CELL };
export type { SolidCell, BoardCell, BoardModel, BoardFactory };
