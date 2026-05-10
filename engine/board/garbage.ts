import type { RandomSource } from "../random";

const pickGarbageHoles = (cellCount: number, holesPerLine: number, random: RandomSource): Set<number> => {
  const holeCount = Math.min(Math.max(1, Math.floor(holesPerLine)), cellCount);
  const holes = new Set<number>();
  const start = Math.floor(Math.max(0, Math.min(0.999999999999, random())) * cellCount);
  const step = Math.max(1, Math.floor(cellCount / holeCount));
  for (let i = 0; holes.size < holeCount; i++) {
    holes.add((start + i * step) % cellCount);
  }
  return holes;
};

export { pickGarbageHoles };
export type { RandomSource };
