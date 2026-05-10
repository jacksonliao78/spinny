import type { SpinResult } from "./rotation";

type AttackInput = {
  linesCleared: number;
  spin: SpinResult | null;
  combo: number;
  backToBackChain: number;
};

const regularClearAttack = (linesCleared: number): number => {
  if (linesCleared <= 1) return 0;
  if (linesCleared === 2) return 1;
  if (linesCleared === 3) return 2;
  return 4;
};

const tSpinAttack = (linesCleared: number): number => {
  if (linesCleared <= 0) return 0;
  if (linesCleared === 1) return 2;
  if (linesCleared === 2) return 4;
  return 6;
};

const allSpinAttack = (linesCleared: number): number => {
  if (linesCleared <= 0) return 0;
  return regularClearAttack(linesCleared) + 1;
};

const comboAttack = (combo: number): number => {
  if (combo < 2) return 0;
  return Math.floor((combo - 1) / 2);
};

const qualifiesForBackToBack = (linesCleared: number, spin: SpinResult | null): boolean => {
  if (linesCleared <= 0) return false;
  return linesCleared >= 4 || spin?.kind === "t-spin";
};

const getAttackLines = ({ linesCleared, spin, combo, backToBackChain }: AttackInput): number => {
  const clears = Math.max(0, Math.floor(linesCleared));
  if (clears <= 0) return 0;
  let attack = regularClearAttack(clears);
  if (spin?.kind === "t-spin") {
    attack = tSpinAttack(clears);
  } else if (spin?.kind === "all-spin") {
    attack = allSpinAttack(clears);
  }

  attack += comboAttack(Math.max(0, Math.floor(combo)));
  if (backToBackChain > 1 && qualifiesForBackToBack(clears, spin)) {
    attack += 1;
  }
  return attack;
};

export { getAttackLines };
export type { AttackInput };
