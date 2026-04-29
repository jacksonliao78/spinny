type GameMode = "timed" | "marathon" | "zen";

type TimedModeConfig = {
  durationMs: number;
};

type GameConfig = {
  mode: GameMode;
  timed: TimedModeConfig;
  linesPerLevel: number;
  baseGravityIntervalMs: number;
  minGravityIntervalMs: number;
  gravityLevelScale: number;
  lineClearPoints: {
    single: number;
    double: number;
    triple: number;
    quad: number;
  };
  softDropPointPerCell: number;
  hardDropPointPerCell: number;
  comboPointPerChain: number;
  garbageEnabled: boolean;
  garbageHolesPerRing: number;
  maxGarbagePerApply: number;
};

type GameDefaults = {
  width: number;
  height: number;
  gravityIntervalMs: number;
};

const DEFAULT_GAME_RULES: GameDefaults = {
  width: 20,
  height: 20,
  gravityIntervalMs: 700,
};

const DEFAULT_GAME_CONFIG: GameConfig = {
  mode: "timed",
  timed: {
    durationMs: 180_000,
  },
  linesPerLevel: 10,
  baseGravityIntervalMs: 700,
  minGravityIntervalMs: 80,
  gravityLevelScale: 0.92,
  lineClearPoints: {
    single: 100,
    double: 300,
    triple: 500,
    quad: 800,
  },
  softDropPointPerCell: 1,
  hardDropPointPerCell: 2,
  comboPointPerChain: 50,
  garbageEnabled: false,
  garbageHolesPerRing: 2,
  maxGarbagePerApply: 1,
};

const getLineClearBasePoints = (linesCleared: number, config: GameConfig): number => {
  switch (linesCleared) {
    case 1:
      return config.lineClearPoints.single;
    case 2:
      return config.lineClearPoints.double;
    case 3:
      return config.lineClearPoints.triple;
    case 4:
      return config.lineClearPoints.quad;
    default:
      return 0;
  }
};

const getGravityIntervalMs = (level: number, config: GameConfig): number => {
  const lvl = Math.max(1, level);
  const scaled = config.baseGravityIntervalMs * (config.gravityLevelScale ** (lvl - 1));
  return Math.max(config.minGravityIntervalMs, Math.round(scaled));
};

const getComboBonusPoints = (combo: number, config: GameConfig): number => {
  return Math.max(0, combo) * config.comboPointPerChain;
};

export { DEFAULT_GAME_CONFIG, DEFAULT_GAME_RULES, getLineClearBasePoints, getGravityIntervalMs, getComboBonusPoints };
export type { GameMode, TimedModeConfig, GameConfig, GameDefaults };
