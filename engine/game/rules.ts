type GameMode = "timed" | "marathon" | "sprint" | "zen";
type GameModeTimerStyle = "countdown" | "countup" | "none";

type GameModePolicy = {
  timerStyle: GameModeTimerStyle;
  advancesLevel: boolean;
  completesAtSprintTarget: boolean;
  showsScore: boolean;
  showsLevel: boolean;
  savesRun: boolean;
};

/** Single source of truth for gameplay tuning, grouped by the system that consumes each value. */
type GameConfig = {
  board: {
    width: number;
    height: number;
  };
  mode: {
    kind: GameMode;
    timedDurationMs: number;
    sprintTargetClears: number;
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
    /** Optional time-based producer; when set, garbage is enqueued automatically as the run progresses. */
    survival?: GarbageSurvivalConfig;
  };
  modifiers: {
    allSpins: boolean;
  };
};

/** Time-driven garbage schedule: an interval is selected per `tierDurationMs` block of elapsed time. */
type GarbageSurvivalConfig = {
  /** Length of each tier in ms; once `intervalsMs` runs out, the last interval is held forever. */
  tierDurationMs: number;
  /** Per-tier interval between enqueue events (lower = faster pressure). */
  intervalsMs: number[];
  /** Lines enqueued per event (typically 1). */
  linesPerEvent: number;
};

type GameConfigOverrides = {
  board?: Partial<GameConfig["board"]>;
  mode?: Partial<GameConfig["mode"]>;
  gravity?: Partial<GameConfig["gravity"]>;
  scoring?: Partial<Omit<GameConfig["scoring"], "lineClearPoints">> & {
    lineClearPoints?: Partial<GameConfig["scoring"]["lineClearPoints"]>;
  };
  garbage?: Partial<Omit<GameConfig["garbage"], "survival">> & {
    survival?: GarbageSurvivalConfig | null;
  };
  modifiers?: Partial<GameConfig["modifiers"]>;
};

const MARATHON_SURVIVAL_GARBAGE: GameConfig["garbage"] = {
  enabled: true,
  holesPerRing: 1,
  maxPerApply: 10,
  survival: {
    tierDurationMs: 60_000,
    intervalsMs: [6_000, 5_000, 4_000, 3_000, 2_000, 1_000],
    linesPerEvent: 1,
  },
};

const GAME_MODE_POLICIES: Record<GameMode, GameModePolicy> = {
  timed: {
    timerStyle: "countdown",
    advancesLevel: true,
    completesAtSprintTarget: false,
    showsScore: true,
    showsLevel: true,
    savesRun: true,
  },
  marathon: {
    timerStyle: "countup",
    advancesLevel: true,
    completesAtSprintTarget: false,
    showsScore: true,
    showsLevel: true,
    savesRun: true,
  },
  sprint: {
    timerStyle: "countup",
    advancesLevel: false,
    completesAtSprintTarget: true,
    showsScore: false,
    showsLevel: false,
    savesRun: true,
  },
  zen: {
    timerStyle: "none",
    advancesLevel: false,
    completesAtSprintTarget: false,
    showsScore: true,
    showsLevel: false,
    savesRun: false,
  },
};

const GAME_MODE_DEFAULT_OVERRIDES: Record<GameMode, GameConfigOverrides> = {
  timed: {},
  marathon: {
    garbage: MARATHON_SURVIVAL_GARBAGE,
  },
  sprint: {},
  zen: {},
};

/** Baseline solo config; modes should override this through `resolveGameConfig`. */
const DEFAULT_GAME_CONFIG: GameConfig = {
  board: {
    width: 20,
    height: 20,
  },
  mode: {
    kind: "timed",
    timedDurationMs: 120_000,
    sprintTargetClears: 40,
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
    survival: undefined,
  },
  modifiers: {
    allSpins: false,
  },
};

const resolveSurvivalConfig = (
  modeGarbage: GameConfigOverrides["garbage"],
  overrideGarbage: GameConfigOverrides["garbage"],
): GarbageSurvivalConfig | undefined => {
  if (overrideGarbage && "survival" in overrideGarbage) return overrideGarbage.survival ?? undefined;
  if (modeGarbage && "survival" in modeGarbage) return modeGarbage.survival ?? undefined;
  return DEFAULT_GAME_CONFIG.garbage.survival;
};

/** Deep-merge partial config overrides without dropping nested defaults like line-clear points. */
const resolveGameConfig = (overrides: GameConfigOverrides = {}): GameConfig => {
  const modeKind = overrides.mode?.kind ?? DEFAULT_GAME_CONFIG.mode.kind;
  const modeDefaults = GAME_MODE_DEFAULT_OVERRIDES[modeKind];

  return {
    board: {
      ...DEFAULT_GAME_CONFIG.board,
      ...modeDefaults.board,
      ...overrides.board,
    },
    mode: {
      ...DEFAULT_GAME_CONFIG.mode,
      ...modeDefaults.mode,
      ...overrides.mode,
    },
    gravity: {
      ...DEFAULT_GAME_CONFIG.gravity,
      ...modeDefaults.gravity,
      ...overrides.gravity,
    },
    scoring: {
      ...DEFAULT_GAME_CONFIG.scoring,
      ...modeDefaults.scoring,
      ...overrides.scoring,
      lineClearPoints: {
        ...DEFAULT_GAME_CONFIG.scoring.lineClearPoints,
        ...modeDefaults.scoring?.lineClearPoints,
        ...overrides.scoring?.lineClearPoints,
      },
    },
    garbage: {
      ...DEFAULT_GAME_CONFIG.garbage,
      ...modeDefaults.garbage,
      ...overrides.garbage,
      survival: resolveSurvivalConfig(modeDefaults.garbage, overrides.garbage),
    },
    modifiers: {
      ...DEFAULT_GAME_CONFIG.modifiers,
      ...modeDefaults.modifiers,
      ...overrides.modifiers,
    },
  };
};

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

export {
  DEFAULT_GAME_CONFIG,
  GAME_MODE_DEFAULT_OVERRIDES,
  GAME_MODE_POLICIES,
  resolveGameConfig,
  getLineClearBasePoints,
  getGravityIntervalMs,
  getComboBonusPoints,
};
export type { GameMode, GameModePolicy, GameModeTimerStyle, GameConfig, GameConfigOverrides, GarbageSurvivalConfig };
