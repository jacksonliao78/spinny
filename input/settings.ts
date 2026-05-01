/** User-facing handling preferences (DAS / ARR / DCD / SDF), persisted in localStorage. */

export const INPUT_SETTINGS_STORAGE_KEY = "spinny.inputSettings.v1";

export const DAS_MIN_MS = 50;
export const DAS_MAX_MS = 300;
export const DAS_DEFAULT_MS = 150;

export const ARR_MIN_MS = 0;
export const ARR_MAX_MS = 100;
export const ARR_DEFAULT_MS = 33;

export const DCD_MIN_MS = 0;
export const DCD_MAX_MS = 120;
export const DCD_DEFAULT_MS = 0;

/** Soft-drop factor as a multiple of natural gravity interval; "instant" = hold-to-contact via softDrop semantics. */
export type SoftDropFactor = { kind: "multiplier"; value: number } | { kind: "instant" };

export const SDF_MIN_MULTIPLIER = 1;
/** Matches default rectangular playfield height from solo setup. */
export const SDF_MAX_MULTIPLIER = 20;

export type InputSettings = {
  dasMs: number;
  arrMs: number;
  dcdMs: number;
  sdf: SoftDropFactor;
};

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  dasMs: DAS_DEFAULT_MS,
  arrMs: ARR_DEFAULT_MS,
  dcdMs: DCD_DEFAULT_MS,
  sdf: { kind: "multiplier", value: 6 },
};

type StoredSdf = number | "instant";

type StoredSettingsV1 = {
  v: 1;
  dasMs: number;
  arrMs: number;
  dcdMs: number;
  sdf: StoredSdf;
};

export function clampDasMs(value: number): number {
  return Math.min(DAS_MAX_MS, Math.max(DAS_MIN_MS, Math.round(value)));
}

export function clampArrMs(value: number): number {
  return Math.min(ARR_MAX_MS, Math.max(ARR_MIN_MS, Math.round(value)));
}

export function clampDcdMs(value: number): number {
  return Math.min(DCD_MAX_MS, Math.max(DCD_MIN_MS, Math.round(value)));
}

export function normalizeSdfMultiplier(value: number): number {
  const rounded = Math.round(value);
  if (rounded >= SDF_MAX_MULTIPLIER) return SDF_MAX_MULTIPLIER;
  return Math.min(SDF_MAX_MULTIPLIER, Math.max(SDF_MIN_MULTIPLIER, rounded));
}

export function sdfFromSliderValue(sliderValue: number): SoftDropFactor {
  const v = Math.round(sliderValue);
  if (v >= SDF_MAX_MULTIPLIER + 1) return { kind: "instant" };
  return { kind: "multiplier", value: normalizeSdfMultiplier(v) };
}

export function sdfToSliderValue(sdf: SoftDropFactor): number {
  if (sdf.kind === "instant") return SDF_MAX_MULTIPLIER + 1;
  return normalizeSdfMultiplier(sdf.value);
}

export function formatSdfLabel(sdf: SoftDropFactor): string {
  if (sdf.kind === "instant") return "Instant";
  return `${sdf.value}×`;
}

export function clampInputSettings(raw: Partial<InputSettings>): InputSettings {
  const sdfRaw = raw.sdf;
  let sdf: SoftDropFactor;
  if (!sdfRaw) {
    sdf = DEFAULT_INPUT_SETTINGS.sdf;
  } else if (sdfRaw.kind === "instant") {
    sdf = { kind: "instant" };
  } else {
    sdf = { kind: "multiplier", value: normalizeSdfMultiplier(sdfRaw.value) };
  }
  return {
    dasMs: clampDasMs(raw.dasMs ?? DEFAULT_INPUT_SETTINGS.dasMs),
    arrMs: clampArrMs(raw.arrMs ?? DEFAULT_INPUT_SETTINGS.arrMs),
    dcdMs: clampDcdMs(raw.dcdMs ?? DEFAULT_INPUT_SETTINGS.dcdMs),
    sdf,
  };
}

function parseStoredSdf(value: unknown): SoftDropFactor | null {
  if (value === "instant") return { kind: "instant" };
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= SDF_MAX_MULTIPLIER + 0.5) return { kind: "instant" };
    return { kind: "multiplier", value: normalizeSdfMultiplier(value) };
  }
  return null;
}

/** Parse localStorage JSON; invalid or partial data falls back to defaults (then clamp). */
export function parseInputSettingsJson(text: string): InputSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return clampInputSettings({});
  }
  if (!parsed || typeof parsed !== "object") return clampInputSettings({});

  const o = parsed as Record<string, unknown>;
  if (o.v === 1) {
    const row = o as unknown as StoredSettingsV1;
    const sdf = parseStoredSdf(row.sdf);
    return clampInputSettings({
      dasMs: typeof row.dasMs === "number" ? row.dasMs : undefined,
      arrMs: typeof row.arrMs === "number" ? row.arrMs : undefined,
      dcdMs: typeof row.dcdMs === "number" ? row.dcdMs : undefined,
      sdf: sdf ?? undefined,
    });
  }

  const legacySdf = parseStoredSdf(o.sdf);
  return clampInputSettings({
    dasMs: typeof o.dasMs === "number" ? o.dasMs : undefined,
    arrMs: typeof o.arrMs === "number" ? o.arrMs : undefined,
    dcdMs: typeof o.dcdMs === "number" ? o.dcdMs : undefined,
    sdf: legacySdf ?? undefined,
  });
}

export function serializeInputSettings(settings: InputSettings): string {
  const clamped = clampInputSettings(settings);
  const stored: StoredSettingsV1 = {
    v: 1,
    dasMs: clamped.dasMs,
    arrMs: clamped.arrMs,
    dcdMs: clamped.dcdMs,
    sdf: clamped.sdf.kind === "instant" ? "instant" : clamped.sdf.value,
  };
  return JSON.stringify(stored);
}

export function loadInputSettings(): InputSettings {
  if (typeof localStorage === "undefined") return clampInputSettings({});
  const raw = localStorage.getItem(INPUT_SETTINGS_STORAGE_KEY);
  if (!raw) return clampInputSettings({});
  return parseInputSettingsJson(raw);
}

export function saveInputSettings(settings: InputSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(INPUT_SETTINGS_STORAGE_KEY, serializeInputSettings(settings));
}
