type GameMode = "timed" | "marathon" | "zen";

/** Single source of truth for gameplay tuning, grouped by the system that consumes each value. */
type GameConfig = {
  board: {
    width: number;
    height: number;
  };
  mode: {
    kind: GameMode;
    timedDurationMs: number;
  };
  gravity: {
    baseIntervalMs: number;
    minIntervalMs: number;
    levelScale: number;
    linesPerLevel: number;
  };
  scoring: {
    lineClearPoints: {
      single: number;
      double: number;
      triple: number;
      quad: number;
    };
    softDropPointPerCell: number;
    hardDropPointPerCell: number;
    comboPointPerChain: number;
  };
  garbage: {
    enabled: boolean;
    holesPerRing: number;
    maxPerApply: number;
  };
  modifiers: {
    allSpins: boolean;
  };
};

type GameConfigOverrides = {
  board?: Partial<GameConfig["board"]>;
  mode?: Partial<GameConfig["mode"]>;
  gravity?: Partial<GameConfig["gravity"]>;
  scoring?: Partial<Omit<GameConfig["scoring"], "lineClearPoints">> & {
    lineClearPoints?: Partial<GameConfig["scoring"]["lineClearPoints"]>;
  };
  garbage?: Partial<GameConfig["garbage"]>;
  modifiers?: Partial<GameConfig["modifiers"]>;
};

/** Baseline solo config; modes should override this through `resolveGameConfig`. */
const DEFAULT_GAME_CONFIG: GameConfig = {
  board: {
    width: 20,
    height: 20,
  },
  mode: {
    kind: "timed",
    timedDurationMs: 180_000,
  },
  gravity: {
    baseIntervalMs: 700,
    minIntervalMs: 80,
    levelScale: 0.92,
    linesPerLevel: 10,
  },
  scoring: {
    lineClearPoints: {
      single: 100,
      double: 300,
      triple: 500,
      quad: 800,
    },
    softDropPointPerCell: 1,
    hardDropPointPerCell: 2,
    comboPointPerChain: 50,
  },
  garbage: {
    enabled: false,
    holesPerRing: 2,
    maxPerApply: 1,
  },
  modifiers: {
    allSpins: false,
  },
};

/** Deep-merge partial config overrides without dropping nested defaults like line-clear points. */
const resolveGameConfig = (overrides: GameConfigOverrides = {}): GameConfig => ({
  board: {
    ...DEFAULT_GAME_CONFIG.board,
    ...overrides.board,
  },
  mode: {
    ...DEFAULT_GAME_CONFIG.mode,
    ...overrides.mode,
  },
  gravity: {
    ...DEFAULT_GAME_CONFIG.gravity,
    ...overrides.gravity,
  },
  scoring: {
    ...DEFAULT_GAME_CONFIG.scoring,
    ...overrides.scoring,
    lineClearPoints: {
      ...DEFAULT_GAME_CONFIG.scoring.lineClearPoints,
      ...overrides.scoring?.lineClearPoints,
    },
  },
  garbage: {
    ...DEFAULT_GAME_CONFIG.garbage,
    ...overrides.garbage,
  },
  modifiers: {
    ...DEFAULT_GAME_CONFIG.modifiers,
    ...overrides.modifiers,
  },
});

/** Return the baseline clear score before combo and level multipliers. */
const getLineClearBasePoints = (linesCleared: number, config: GameConfig): number => {
  switch (linesCleared) {
    case 1:
      return config.scoring.lineClearPoints.single;
    case 2:
      return config.scoring.lineClearPoints.double;
    case 3:
      return config.scoring.lineClearPoints.triple;
    case 4:
      return config.scoring.lineClearPoints.quad;
    default:
      return 0;
  }
};

/** Convert level to fall interval, clamped so gravity never becomes unplayably fast. */
const getGravityIntervalMs = (level: number, config: GameConfig): number => {
  const lvl = Math.max(1, level);
  const scaled = config.gravity.baseIntervalMs * (config.gravity.levelScale ** (lvl - 1));
  return Math.max(config.gravity.minIntervalMs, Math.round(scaled));
};

/** Combo is zero for the first clear in a chain, then increases by one per consecutive clear. */
const getComboBonusPoints = (combo: number, config: GameConfig): number => {
  return Math.max(0, combo) * config.scoring.comboPointPerChain;
};

export { DEFAULT_GAME_CONFIG, resolveGameConfig, getLineClearBasePoints, getGravityIntervalMs, getComboBonusPoints };
export type { GameMode, GameConfig, GameConfigOverrides };
