import type { PieceType } from "@game/piece";

type PieceStyle = {
  fill: string;
  edge: string;
  glow: string;
};

const PIECE_STYLES: Record<PieceType, PieceStyle> = {
  O: { fill: "#f7dc83", edge: "#c4ab56", glow: "#f7dc83" },
  I: { fill: "#7ed7ef", edge: "#4f9dbf", glow: "#7ed7ef" },
  Z: { fill: "#de7ea0", edge: "#a55674", glow: "#de7ea0" },
  S: { fill: "#72d89d", edge: "#479368", glow: "#72d89d" },
  L: { fill: "#bf8a69", edge: "#8e6347", glow: "#bf8a69" },
  J: { fill: "#6f7ddb", edge: "#4b56a6", glow: "#6f7ddb" },
  T: { fill: "#a276d9", edge: "#6f4ca4", glow: "#a276d9" },
};

export { PIECE_STYLES };
export type { PieceStyle };
