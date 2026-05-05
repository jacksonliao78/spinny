import type { PieceType } from "./piece";

type KickOffset = readonly [dx: number, dy: number];
type Spin = "cw" | "ccw";
/** Normalized rotation transition key used by the Super Rotation System kick tables. */
type RotationTransition =
  | "0>1"
  | "1>2"
  | "2>3"
  | "3>0"
  | "0>3"
  | "3>2"
  | "2>1"
  | "1>0";

/** Opposite rotation states for 180° (TETR.IO–style default kicks; see docs/srs_rotation.md). */
type HalfTurnTransition = "0>2" | "2>0" | "1>3" | "3>1";

type TryKickArgs = {
  pieceType: PieceType;
  fromRot: number;
  toRot: number;
  spin: Spin;
  baseX: number;
  baseY: number;
  canPlace: (rot: number, x: number, y: number) => boolean;
};

type Try180KickArgs = Omit<TryKickArgs, "spin">;

type SrsPlacement = {
  x: number;
  y: number;
  rot: number;
  usedKick: KickOffset;
};

const NO_KICKS: readonly KickOffset[] = [[0, 0]] as const;

/** SRS kick tests for J/L/S/T/Z pieces; coordinates are board-space offsets. */
const JLSTZ_CW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
} as const;

const JLSTZ_CCW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
} as const;

/**
 * Guideline I kicks (reference); Spinny uses {@link I_SRSPLUS_CW} / {@link I_SRSPLUS_CCW} for TETR.IO SRS+ parity.
 */
const I_GUIDELINE_CW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
} as const;

/** TETR.IO SRS+: symmetric I kicks (Hard Drop “Arika SRS” I table; matches Tetris.wiki SRS+ description). */
const I_SRSPLUS_CW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [1, 2], [-2, -1]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -1]],
  "3>0": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "2>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -1]],
  "3>2": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [2, 0], [-1, 0], [-1, 2], [2, -1]],
} as const;

const I_SRSPLUS_CCW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>3": [[0, 0], [2, 0], [-1, 0], [-1, 2], [2, -1]],
  "3>2": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -1]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>0": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -1]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "0>1": [[0, 0], [-2, 0], [1, 0], [1, 2], [-2, -1]],
} as const;

/**
 * TETR.IO default 180° kicks for JLSTZ (six tests); community reverse-engineering consensus (e.g. tetra-tools).
 */
const JLSTZ_180: Readonly<Record<HalfTurnTransition, readonly KickOffset[]>> = {
  "0>2": [[0, -1], [0, 0], [1, 0], [-1, 0], [1, -1], [-1, -1]],
  "2>0": [[0, 1], [0, 0], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  "1>3": [[-1, 0], [0, 0], [0, 2], [0, 1], [-1, 2], [-1, 1]],
  "3>1": [[1, 0], [0, 0], [0, 2], [0, 1], [1, 2], [1, 1]],
} as const;

/** Same 180 kick sets as JLSTZ for I under TETR.IO default (shared six-test pattern). */
const I_180: Readonly<Record<HalfTurnTransition, readonly KickOffset[]>> = JLSTZ_180;

const normalizeRotation = (n: number): number => {
  return ((n % 4) + 4) % 4;
};

const getRotationDelta = (spin: Spin): 1 | -1 => {
  return spin === "cw" ? 1 : -1;
};

const halfTurnKey = (from: number, to: number): HalfTurnTransition =>
  `${normalizeRotation(from)}>${normalizeRotation(to)}` as HalfTurnTransition;

const getKickTests = (
  piece: PieceType,
  from: number,
  to: number,
  spin: Spin,
): readonly KickOffset[] => {
  const key = `${normalizeRotation(from)}>${normalizeRotation(to)}` as RotationTransition;
  if (piece === "O") return NO_KICKS;
  if (piece === "I") return (spin === "cw" ? I_SRSPLUS_CW[key] : I_SRSPLUS_CCW[key]) ?? NO_KICKS;
  return (spin === "cw" ? JLSTZ_CW[key] : JLSTZ_CCW[key]) ?? NO_KICKS;
};

const getKicks = (
  piece: PieceType,
  fromRot: number,
  toRot: number,
  spin: Spin,
): readonly KickOffset[] => {
  return getKickTests(piece, fromRot, toRot, spin);
};

const get180KickTests = (piece: PieceType, from: number, to: number): readonly KickOffset[] => {
  const key = halfTurnKey(from, to);
  if (piece === "O") return NO_KICKS;
  if (piece === "I") return I_180[key] ?? NO_KICKS;
  return JLSTZ_180[key] ?? NO_KICKS;
};

const get180Kicks = (piece: PieceType, fromRot: number, toRot: number): readonly KickOffset[] =>
  get180KickTests(piece, fromRot, toRot);

/** Return the first SRS kick placement accepted by the caller's collision check. */
const tryKicks = (args: TryKickArgs): SrsPlacement | null => {
  const kicks = getKicks(args.pieceType, args.fromRot, args.toRot, args.spin);

  for (const [dx, dy] of kicks) {
    const x = args.baseX + dx;
    const y = args.baseY + dy;
    if (args.canPlace(args.toRot, x, y)) {
      return { x, y, rot: args.toRot, usedKick: [dx, dy] };
    }
  }
  return null;
};

/** Return the first 180° kick placement accepted by the caller's collision check. */
const try180Kicks = (args: Try180KickArgs): SrsPlacement | null => {
  const kicks = get180KickTests(args.pieceType, args.fromRot, args.toRot);

  for (const [dx, dy] of kicks) {
    const x = args.baseX + dx;
    const y = args.baseY + dy;
    if (args.canPlace(args.toRot, x, y)) {
      return { x, y, rot: args.toRot, usedKick: [dx, dy] };
    }
  }
  return null;
};

export {
  I_GUIDELINE_CW,
  I_SRSPLUS_CCW,
  I_SRSPLUS_CW,
  JLSTZ_180,
  JLSTZ_CCW,
  JLSTZ_CW,
  NO_KICKS,
  get180KickTests,
  get180Kicks,
  getKickTests,
  getKicks,
  getRotationDelta,
  normalizeRotation,
  try180Kicks,
  tryKicks,
};
export type {
  HalfTurnTransition,
  KickOffset,
  RotationTransition,
  Spin,
  SrsPlacement,
  TryKickArgs,
};
