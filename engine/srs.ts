import type { PieceType } from "./piece";

type KickOffset = readonly [dx: number, dy: number];
type Spin = "cw" | "ccw";
type RotationTransition =
  | "0>1"
  | "1>2"
  | "2>3"
  | "3>0"
  | "0>3"
  | "3>2"
  | "2>1"
  | "1>0";

type TryKickArgs = {
  pieceType: PieceType;
  fromRot: number;
  toRot: number;
  spin: Spin;
  baseX: number;
  baseY: number;
  canPlace: (rot: number, x: number, y: number) => boolean;
};

type SrsPlacement = {
  x: number;
  y: number;
  rot: number;
  usedKick: KickOffset;
};

const NO_KICKS: readonly KickOffset[] = [[0, 0]] as const;

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

const I_CW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
} as const;

const I_CCW: Readonly<Record<RotationTransition, readonly KickOffset[]>> = {
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
} as const;

const normalizeRotation = (n: number): number => {
  return ((n % 4) + 4) % 4;
};

const getRotationDelta = (spin: Spin): 1 | -1 => {
  return spin === "cw" ? 1 : -1;
};

const getKickTests = (
  piece: PieceType,
  from: number,
  to: number,
  spin: Spin,
): readonly KickOffset[] => {
  const key = `${normalizeRotation(from)}>${normalizeRotation(to)}` as RotationTransition;
  if (piece === "O") return NO_KICKS;
  if (piece === "I") return (spin === "cw" ? I_CW[key] : I_CCW[key]) ?? NO_KICKS;
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

const tryKicks = (args: TryKickArgs): SrsPlacement | null => {
  const kicks = getKicks(
    args.pieceType,
    args.fromRot,
    args.toRot,
    args.spin,
  );

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
  I_CCW,
  I_CW,
  JLSTZ_CCW,
  JLSTZ_CW,
  NO_KICKS,
  getKickTests,
  getRotationDelta,
  normalizeRotation,
  getKicks,
  tryKicks,
};
export type {
  KickOffset,
  RotationTransition,
  Spin,
  SrsPlacement,
  TryKickArgs,
};
