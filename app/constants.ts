import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";

type AppScreen =
  | "landing"
  | "auth"
  | "setup"
  | "playing"
  | "settings"
  | "stats"
  | "bots-setup"
  | "bots-playing"
  | "multiplayer"
  | "lobby"
  | "multiplayer-playing";
type AuthMode = "login" | "signup";

const MODE_LABELS: Record<GameMode, string> = {
  timed: "Timed",
  marathon: "Marathon",
  sprint: "Sprint",
  zen: "Zen",
  versus: "Versus",
};

const DEFAULT_BOARD_KIND: BoardKind = "rectangular";
const DEFAULT_GAME_MODE: GameMode = "timed";
const SPINNY_BOARD_PREF_KEY = "spinny.useSpinnyBoard.v1";
const RECTANGULAR_BOARD_CONFIG = { width: 10, height: 20 };
const SPRINT_TARGET_CLEARS: Record<BoardKind, number> = {
  rectangular: 40,
  ring: 10,
};
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const PENDING_SIGNUP_USERNAME_KEY = "spinny.pendingSignupUsername.v1";

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
  SPINNY_BOARD_PREF_KEY,
  SPRINT_TARGET_CLEARS,
  SETTINGS_TEST_CONFIG,
  USERNAME_PATTERN,
};
export type { AppScreen, AuthMode };
