import { Game } from "@game/game";
import type { User } from "@supabase/supabase-js";
import { createBoard } from "@game/board/factory";
import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import { createRenderer } from "./render/renderer";
import { createMiniBoardRenderer } from "./render/miniBoard";
import {
  DEFAULT_INPUT_SETTINGS,
  clampInputSettings,
  formatSdfLabel,
  loadInputSettings,
  saveInputSettings,
  sdfFromSliderValue,
  sdfToSliderValue,
  type InputSettings,
} from "./input/settings";
import { createInputController, gameplayCallbacksFor } from "./input/controller";
import { getSupabase, isSupabaseConfigured } from "./supabase/client";

type AppScreen = "landing" | "auth" | "setup" | "playing" | "settings";
type AuthMode = "login" | "signup";

const MODE_LABELS: Record<GameMode, string> = {
  timed: "Timed",
  marathon: "Marathon",
  zen: "Zen",
};
const RECTANGULAR_BOARD_CONFIG = { width: 10, height: 20 };
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const PENDING_SIGNUP_USERNAME_KEY = "spinny.pendingSignupUsername.v1";

const SETTINGS_TEST_CONFIG = {
  board: { width: 10, height: 20 },
  mode: { kind: "zen" as const },
};

const getElement = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: ${id}`);
  return el as T;
};

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const savePendingSignupUsername = (email: string, username: string): void => {
  localStorage.setItem(PENDING_SIGNUP_USERNAME_KEY, JSON.stringify({ email: email.toLowerCase(), username }));
};

const loadPendingSignupUsername = (email: string | undefined): string | null => {
  if (!email) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SIGNUP_USERNAME_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const pending = parsed as { email?: unknown; username?: unknown };
    if (pending.email !== email.toLowerCase()) return null;
    return typeof pending.username === "string" ? pending.username : null;
  } catch {
    return null;
  }
};

const clearPendingSignupUsername = (): void => {
  localStorage.removeItem(PENDING_SIGNUP_USERNAME_KEY);
};

const readableAuthError = (error: unknown): string => {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";
    if (code === "23505" || /duplicate|unique/i.test(message)) return "That username is already taken.";
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
};

const isUsernameTakenError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "23505" || /duplicate|unique/i.test(message);
};

/** Browser entry point: owns DOM screens/input wiring, while Game and renderer own simulation/drawing. */
function main(): void {
  const landingScreen = getElement<HTMLElement>("landing-screen");
  const authScreen = getElement<HTMLElement>("auth-screen");
  const setupScreen = getElement<HTMLElement>("setup-screen");
  const gameScreen = getElement<HTMLElement>("game-screen");
  const settingsScreen = getElement<HTMLElement>("settings-screen");

  const soloButton = getElement<HTMLButtonElement>("solo-button");
  const authButton = getElement<HTMLButtonElement>("auth-button");
  const signOutButton = getElement<HTMLButtonElement>("sign-out-button");
  const authSummaryText = getElement<HTMLElement>("auth-summary-text");
  const settingsButton = getElement<HTMLButtonElement>("settings-button");
  const settingsBackButton = getElement<HTMLButtonElement>("settings-back-button");

  const authBackButton = getElement<HTMLButtonElement>("auth-back-button");
  const authHeading = getElement<HTMLElement>("auth-heading");
  const authForm = getElement<HTMLFormElement>("auth-form");
  const authLoginTab = getElement<HTMLButtonElement>("auth-login-tab");
  const authSignupTab = getElement<HTMLButtonElement>("auth-signup-tab");
  const authEmail = getElement<HTMLInputElement>("auth-email");
  const authPassword = getElement<HTMLInputElement>("auth-password");
  const authUsernameRow = getElement<HTMLLabelElement>("auth-username-row");
  const authUsername = getElement<HTMLInputElement>("auth-username");
  const authStatus = getElement<HTMLElement>("auth-status");
  const authSubmitButton = getElement<HTMLButtonElement>("auth-submit-button");
  const guestPlayButton = getElement<HTMLButtonElement>("guest-play-button");

  const backToLandingButton = getElement<HTMLButtonElement>("back-to-landing-button");
  const backToSetupButton = getElement<HTMLButtonElement>("back-to-setup-button");
  const startGameButton = getElement<HTMLButtonElement>("start-game-button");
  const tipsButton = getElement<HTMLButtonElement>("tips-button");
  const tipsPopover = getElement<HTMLElement>("tips-popover");
  const gameActions = getElement<HTMLElement>("game-actions");
  const gameTitle = getElement<HTMLElement>("game-title");
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button[data-mode]"));
  const boardButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".board-option[data-board]"));
  const canvas = getElement<HTMLCanvasElement>("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const settingsCanvas = getElement<HTMLCanvasElement>("settings-test-board");
  const settingsCtx = settingsCanvas.getContext("2d");
  if (!settingsCtx) return;

  const dasSlider = getElement<HTMLInputElement>("das-slider");
  const arrSlider = getElement<HTMLInputElement>("arr-slider");
  const dcdSlider = getElement<HTMLInputElement>("dcd-slider");
  const sdfSlider = getElement<HTMLInputElement>("sdf-slider");
  const dasValue = getElement<HTMLElement>("das-value");
  const arrValue = getElement<HTMLElement>("arr-value");
  const dcdValue = getElement<HTMLElement>("dcd-value");
  const sdfValue = getElement<HTMLElement>("sdf-value");
  const settingsResetButton = getElement<HTMLButtonElement>("settings-reset-button");

  let inputSettings: InputSettings = clampInputSettings(loadInputSettings());

  let appScreen: AppScreen = "landing";
  let selectedMode: GameMode = "timed";
  let selectedBoard: BoardKind = "ring";
  let game: Game | null = null;
  let testGame: Game | null = null;
  let authMode: AuthMode = "login";
  let currentUser: User | null = null;
  let currentUsername: string | null = null;
  let guestMode = true;
  let settingsTestFocused = false;
  let paused = false;
  const supabase = isSupabaseConfigured() ? getSupabase() : null;
  const renderer = createRenderer(canvas, ctx);
  const miniRenderer = createMiniBoardRenderer(settingsCanvas, settingsCtx);

  const gameplayController = createInputController(
    () => (game && !game.getSnapshot().gameOver ? gameplayCallbacksFor(game) : null),
    inputSettings,
  );

  const testController = createInputController(
    () => (testGame && !testGame.getSnapshot().gameOver ? gameplayCallbacksFor(testGame) : null),
    inputSettings,
  );

  gameplayController.attach(canvas);
  testController.attach(settingsCanvas);

  const applyInputSettings = (next: InputSettings): void => {
    inputSettings = clampInputSettings(next);
    saveInputSettings(inputSettings);
    gameplayController.setSettings(inputSettings);
    testController.setSettings(inputSettings);
  };

  const refreshSettingsUi = (): void => {
    const s = inputSettings;
    dasSlider.value = String(s.dasMs);
    arrSlider.value = String(s.arrMs);
    dcdSlider.value = String(s.dcdMs);
    sdfSlider.value = String(sdfToSliderValue(s.sdf));
    dasValue.textContent = `${s.dasMs}ms`;
    arrValue.textContent = `${s.arrMs}ms`;
    dcdValue.textContent = `${s.dcdMs}ms`;
    sdfValue.textContent = formatSdfLabel(s.sdf);
  };

  refreshSettingsUi();

  const setAuthStatus = (message: string, kind: "info" | "error" = "info"): void => {
    authStatus.textContent = message;
    authStatus.dataset.kind = kind;
  };

  const setAuthPending = (pending: boolean): void => {
    authSubmitButton.disabled = pending;
    guestPlayButton.disabled = pending;
    authLoginTab.disabled = pending;
    authSignupTab.disabled = pending;
  };

  const refreshAuthModeUi = (): void => {
    const signingUp = authMode === "signup";
    authHeading.textContent = signingUp ? "Create Account" : "Sign In";
    authSubmitButton.textContent = signingUp ? "Create Account" : "Log In";
    authUsernameRow.hidden = !signingUp;
    authUsername.required = signingUp;
    authPassword.autocomplete = signingUp ? "new-password" : "current-password";
    authLoginTab.classList.toggle("auth-tab--selected", !signingUp);
    authSignupTab.classList.toggle("auth-tab--selected", signingUp);
    authLoginTab.setAttribute("aria-selected", String(!signingUp));
    authSignupTab.setAttribute("aria-selected", String(signingUp));
    setAuthStatus("");
  };

  const refreshAuthSummary = (): void => {
    if (currentUser) {
      const label = currentUsername ?? currentUser.email ?? "player";
      authSummaryText.textContent = `Signed in as ${label}`;
      authButton.hidden = true;
      signOutButton.hidden = false;
    } else {
      authSummaryText.textContent = guestMode ? "Playing as guest" : "Not signed in";
      authButton.hidden = false;
      signOutButton.hidden = true;
    }
  };

  const loadProfileUsername = async (userId: string): Promise<string | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle();
    if (error) {
      console.warn("Could not load profile username", error);
      return null;
    }
    return typeof data?.username === "string" && data.username.length > 0 ? data.username : null;
  };

  const getSignupUsernameCandidate = (user: User): string | null => {
    const metadataUsername = user.user_metadata.username;
    const pendingUsername = loadPendingSignupUsername(user.email);
    const candidate = typeof metadataUsername === "string" ? metadataUsername : pendingUsername;
    if (!candidate) return null;
    const normalized = normalizeUsername(candidate);
    return USERNAME_PATTERN.test(normalized) ? normalized : null;
  };

  const saveProfileUsername = async (userId: string, username: string): Promise<void> => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.from("profiles").upsert({ user_id: userId, username }, { onConflict: "user_id" });
    if (error) throw error;
  };

  const syncAuthState = async (user: User | null): Promise<void> => {
    currentUser = user;
    currentUsername = user ? await loadProfileUsername(user.id) : null;
    if (user && !currentUsername) {
      const username = getSignupUsernameCandidate(user);
      if (username) {
        try {
          await saveProfileUsername(user.id, username);
          currentUsername = username;
          clearPendingSignupUsername();
        } catch (error) {
          console.warn("Could not create profile after login", error);
        }
      }
    }
    guestMode = !user;
    refreshAuthSummary();
  };

  const setTipsOpen = (open: boolean): void => {
    tipsPopover.hidden = !open;
    tipsButton.setAttribute("aria-expanded", String(open));
  };

  const spinBlocksInput = (): boolean => {
    if (appScreen === "playing") return renderer.isSpinAnimating();
    return false;
  };

  const syncInputControllerState = (): void => {
    const playing = appScreen === "playing";
    const settings = appScreen === "settings";

    gameplayController.setEnabled(playing && !paused && !!game && !game.getSnapshot().gameOver && !spinBlocksInput());

    testController.setEnabled(settings && settingsTestFocused && !!testGame && !testGame.getSnapshot().gameOver);
  };

  const restartTestGame = (): void => {
    testGame = new Game({
      boardFactory: (width, height) => createBoard("rectangular", width, height),
      config: SETTINGS_TEST_CONFIG,
    });
    miniRenderer.syncSize(testGame);
  };

  const setScreen = (nextScreen: AppScreen): void => {
    appScreen = nextScreen;
    landingScreen.classList.toggle("screen--active", nextScreen === "landing");
    authScreen.classList.toggle("screen--active", nextScreen === "auth");
    setupScreen.classList.toggle("screen--active", nextScreen === "setup");
    gameScreen.classList.toggle("screen--active", nextScreen === "playing");
    settingsScreen.classList.toggle("screen--active", nextScreen === "settings");

    if (nextScreen !== "playing") {
      paused = true;
      setTipsOpen(false);
    }

    if (nextScreen === "settings") {
      if (!testGame) restartTestGame();
      miniRenderer.syncSize(testGame!);
      settingsTestFocused = false;
    } else {
      settingsTestFocused = false;
    }

    syncInputControllerState();
  };

  const makeGameConfig = () => ({
    ...(selectedBoard === "rectangular" ? { board: RECTANGULAR_BOARD_CONFIG } : {}),
    mode: {
      kind: selectedMode,
    },
  });

  const startGame = (): void => {
    game = new Game({
      boardFactory: (width, height) => createBoard(selectedBoard, width, height),
      config: makeGameConfig(),
    });
    paused = false;
    gameTitle.textContent = `Solo / ${MODE_LABELS[selectedMode]}`;
    setScreen("playing");
    renderer.syncGameConfig(game);
    renderer.reset(game.getSnapshot().boardRotation);
    last = performance.now();
    canvas.focus();
  };

  const resetGame = (): void => {
    startGame();
  };
  window.addEventListener("resize", () => {
    if (game) renderer.syncGameConfig(game);
    if (testGame) miniRenderer.syncSize(testGame);
  });

  let last = performance.now();

  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (appScreen === "playing" && game && !paused) {
      game.tick(dt);
      renderer.updateRotation(game.getSnapshot().boardRotation, dt);
    }
    if (appScreen === "settings" && testGame) {
      if (settingsTestFocused) {
        if (testGame.getSnapshot().gameOver) {
          restartTestGame();
        } else {
          testGame.tick(dt);
        }
      }
    }
    syncInputControllerState();
    if (appScreen === "playing" && game) {
      const g = game.getSnapshot().gravityIntervalMs;
      gameplayController.update(dt, g);
      renderer.draw(game, paused);
    }
    if (appScreen === "settings" && testGame) {
      const g = testGame.getSnapshot().gravityIntervalMs;
      testController.update(dt, g);
      miniRenderer.draw(testGame);
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  canvas.addEventListener("click", () => canvas.focus());
  settingsCanvas.addEventListener("click", () => {
    settingsTestFocused = true;
    settingsCanvas.focus();
    syncInputControllerState();
  });
  settingsCanvas.addEventListener("focus", () => {
    settingsTestFocused = true;
    syncInputControllerState();
  });
  settingsCanvas.addEventListener("blur", () => {
    settingsTestFocused = false;
    syncInputControllerState();
  });

  authLoginTab.addEventListener("click", () => {
    authMode = "login";
    refreshAuthModeUi();
  });

  authSignupTab.addEventListener("click", () => {
    authMode = "signup";
    refreshAuthModeUi();
  });

  authButton.addEventListener("click", () => {
    authMode = "login";
    refreshAuthModeUi();
    setScreen("auth");
    authEmail.focus();
  });

  authBackButton.addEventListener("click", () => setScreen("landing"));

  guestPlayButton.addEventListener("click", () => {
    guestMode = true;
    refreshAuthSummary();
    setScreen("setup");
  });

  authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!supabase) {
      setAuthStatus("Supabase is not configured. Check .env.local and restart Vite.", "error");
      return;
    }

    const email = authEmail.value.trim();
    const password = authPassword.value;
    const username = normalizeUsername(authUsername.value);

    if (authMode === "signup" && !USERNAME_PATTERN.test(username)) {
      setAuthStatus("Username must be 3-24 characters: lowercase letters, numbers, or underscores.", "error");
      return;
    }

    const submit = async (): Promise<void> => {
      setAuthPending(true);
      setAuthStatus(authMode === "signup" ? "Creating account..." : "Signing in...");
      try {
        if (authMode === "login") {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          await syncAuthState(data.user);
          setScreen("landing");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;
        savePendingSignupUsername(email, username);
        if (!data.user) {
          setAuthStatus("Check your email to confirm your account, then log in.", "info");
          return;
        }
        if (!data.session) {
          setAuthStatus("Check your email to confirm your account. Your username will be saved when you log in.", "info");
          return;
        }

        try {
          await saveProfileUsername(data.user.id, username);
        } catch (profileError) {
          if (isUsernameTakenError(profileError)) {
            await supabase.auth.signOut();
            await syncAuthState(null);
          }
          throw profileError;
        }

        currentUsername = username;
        clearPendingSignupUsername();
        await syncAuthState(data.user);
        setScreen("landing");
      } catch (error) {
        setAuthStatus(readableAuthError(error), "error");
      } finally {
        setAuthPending(false);
      }
    };

    void submit();
  });

  signOutButton.addEventListener("click", () => {
    if (!supabase) {
      void syncAuthState(null);
      return;
    }

    const signOut = async (): Promise<void> => {
      signOutButton.disabled = true;
      const { error } = await supabase.auth.signOut();
      if (error) {
        authSummaryText.textContent = error.message;
      } else {
        await syncAuthState(null);
      }
      signOutButton.disabled = false;
    };

    void signOut();
  });

  soloButton.addEventListener("click", () => setScreen("setup"));
  settingsButton.addEventListener("click", () => setScreen("settings"));
  settingsBackButton.addEventListener("click", () => setScreen("landing"));
  backToLandingButton.addEventListener("click", () => setScreen("landing"));
  backToSetupButton.addEventListener("click", () => setScreen("setup"));
  startGameButton.addEventListener("click", () => startGame());
  tipsButton.addEventListener("click", () => setTipsOpen(!!tipsPopover.hidden));
  document.addEventListener("click", (e) => {
    if (tipsPopover.hidden || gameActions.contains(e.target as Node)) return;
    setTipsOpen(false);
  });
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode as GameMode;
      modeButtons.forEach((modeButton) => {
        modeButton.classList.toggle("mode-button--selected", modeButton === button);
      });
    });
  });
  boardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedBoard = button.dataset.board as BoardKind;
      boardButtons.forEach((boardButton) => {
        const selected = boardButton === button;
        boardButton.classList.toggle("board-option--selected", selected);
        boardButton.setAttribute("aria-pressed", String(selected));
      });
    });
  });

  const readSlidersToSettings = (): InputSettings =>
    clampInputSettings({
      dasMs: Number(dasSlider.value),
      arrMs: Number(arrSlider.value),
      dcdMs: Number(dcdSlider.value),
      sdf: sdfFromSliderValue(Number(sdfSlider.value)),
    });

  dasSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });
  arrSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });
  dcdSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });
  sdfSlider.addEventListener("input", () => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  });

  settingsResetButton.addEventListener("click", () => {
    applyInputSettings(DEFAULT_INPUT_SETTINGS);
    refreshSettingsUi();
    restartTestGame();
  });

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
    if (e.code === "Escape" && !tipsPopover.hidden) {
      setTipsOpen(false);
      e.preventDefault();
      return true;
    }
    if (appScreen !== "playing") return false;
    if (e.code === "KeyP") {
      paused = !paused;
      e.preventDefault();
      return true;
    }
    if (e.code === "KeyR") {
      resetGame();
      e.preventDefault();
      return true;
    }
    return false;
  };

  const shouldBlockGameplayKey = (): boolean => {
    if (appScreen === "playing") {
      return !game || paused || game.getSnapshot().gameOver || spinBlocksInput();
    }
    if (appScreen === "settings") {
      return !testGame || testGame.getSnapshot().gameOver;
    }
    return true;
  };

  const blockHandledKeys = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowDown":
      case "ArrowUp":
      case "Space":
      case "KeyZ":
      case "KeyX":
      case "KeyC":
        e.preventDefault();
        return;
      default:
        return;
    }
  };

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (handleGlobalKeys(e)) return;
    if (appScreen !== "playing") {
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });

  settingsCanvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (appScreen !== "settings") {
      e.preventDefault();
      return;
    }
    if (e.code === "KeyR") {
      restartTestGame();
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });

  applyInputSettings(inputSettings);
  refreshAuthModeUi();
  refreshAuthSummary();
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      void syncAuthState(data.session?.user ?? null);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      void syncAuthState(session?.user ?? null);
    });
  }
  setScreen("landing");
}

main();
