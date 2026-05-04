import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";

type AppScreen = "landing" | "auth" | "setup" | "playing" | "settings";
type AuthMode = "login" | "signup";

const MODE_LABELS: Record<GameMode, string> = {
  timed: "Timed",
  marathon: "Marathon",
  zen: "Zen",
};

const DEFAULT_BOARD_KIND: BoardKind = "ring";
const DEFAULT_GAME_MODE: GameMode = "timed";
const RECTANGULAR_BOARD_CONFIG = { width: 10, height: 20 };
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const PENDING_SIGNUP_USERNAME_KEY = "spinny.pendingSignupUsername.v1";
const SAVED_RUN_MODES: ReadonlySet<GameMode> = new Set(["timed", "marathon"]);

const SETTINGS_TEST_CONFIG = {
  board: { width: 10, height: 20 },
  mode: { kind: "zen" as const },
};

export {
  DEFAULT_BOARD_KIND,
  DEFAULT_GAME_MODE,
  MODE_LABELS,
  PENDING_SIGNUP_USERNAME_KEY,
  RECTANGULAR_BOARD_CONFIG,
  SAVED_RUN_MODES,
  SETTINGS_TEST_CONFIG,
  USERNAME_PATTERN,
};
export type { AppScreen, AuthMode };
