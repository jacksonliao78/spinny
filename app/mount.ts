import { Game } from "@game/game";
import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import { createInputController, gameplayCallbacksFor } from "../input/controller";
import {
  clampInputSettings,
  loadInputSettings,
  saveInputSettings,
  type InputSettings,
} from "../input/settings";
import { createMiniBoardRenderer } from "../render/miniBoard";
import { createHudUpdater } from "../render/hudPanels";
import { createRenderer } from "../render/renderer";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import { DEFAULT_BOARD_KIND, DEFAULT_GAME_MODE, SPINNY_BOARD_PREF_KEY, type AppScreen } from "./constants";
import { getElement } from "./dom";
import { createSessionController } from "./session";
import { initAuthScreen } from "./screens/auth";
import type { AuthScreen } from "./screens/auth";
import { initLandingScreen } from "./screens/landing";
import { initPlayingScreen } from "./screens/playing";
import type { PlayingScreen } from "./screens/playing";
import { initSettingsScreen } from "./screens/settings";
import type { SettingsScreen } from "./screens/settings";
import { initSetupScreen } from "./screens/setup";

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

const mountApp = (): void => {
  const landingScreen = getElement<HTMLElement>("landing-screen");
  const authScreenEl = getElement<HTMLElement>("auth-screen");
  const setupScreen = getElement<HTMLElement>("setup-screen");
  const gameScreen = getElement<HTMLElement>("game-screen");
  const settingsScreenEl = getElement<HTMLElement>("settings-screen");

  const soloButton = getElement<HTMLButtonElement>("solo-button");
  const authButton = getElement<HTMLButtonElement>("auth-button");
  const signOutButton = getElement<HTMLButtonElement>("sign-out-button");
  const authSummaryText = getElement<HTMLElement>("auth-summary-text");
  const settingsButton = getElement<HTMLButtonElement>("settings-button");

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
  const spinnyToggleButton = getElement<HTMLButtonElement>("spinny-toggle");
  const canvas = getElement<HTMLCanvasElement>("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const holdCanvas = getElement<HTMLCanvasElement>("hold-canvas");
  const nextCanvas = getElement<HTMLCanvasElement>("next-canvas");
  const statTimer = getElement<HTMLElement>("stat-timer");
  const statLinesRow = getElement<HTMLElement>("stat-lines-row");
  const statLines = getElement<HTMLElement>("stat-lines");
  const statScoreRow = getElement<HTMLElement>("stat-score-row");
  const statScore = getElement<HTMLElement>("stat-score");
  const statLevelRow = getElement<HTMLElement>("stat-level-row");
  const statLevel = getElement<HTMLElement>("stat-level");
  const statComboRow = getElement<HTMLElement>("stat-combo-row");
  const statCombo = getElement<HTMLElement>("stat-combo");
  const statSurvivalRow = getElement<HTMLElement>("stat-survival-row");
  const statSurvival = getElement<HTMLElement>("stat-survival");

  const settingsBackButton = getElement<HTMLButtonElement>("settings-back-button");
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
  let selectedMode: GameMode = DEFAULT_GAME_MODE;
  const initialSpinnyOn = (() => {
    try {
      return window.localStorage.getItem(SPINNY_BOARD_PREF_KEY) === "1";
    } catch {
      return false;
    }
  })();
  let selectedBoard: BoardKind = initialSpinnyOn ? "ring" : DEFAULT_BOARD_KIND;
  let game: Game | null = null;
  let testGame: Game | null = null;
  let settingsTestFocused = false;
  let paused = false;
  let last = performance.now();

  const supabase = isSupabaseConfigured() ? getSupabase() : null;
  const renderer = createRenderer(canvas, ctx);
  const hudUpdater = createHudUpdater({
    holdCanvas,
    nextCanvas,
    timerEl: statTimer,
    linesRow: statLinesRow,
    linesValue: statLines,
    scoreRow: statScoreRow,
    scoreValue: statScore,
    levelRow: statLevelRow,
    levelValue: statLevel,
    comboRow: statComboRow,
    comboValue: statCombo,
    survivalRow: statSurvivalRow,
    survivalValue: statSurvival,
  });
  const miniRenderer = createMiniBoardRenderer(settingsCanvas, settingsCtx);

  const session = createSessionController({
    supabase,
    ui: {
      authSummaryText,
      authButton,
      signOutButton,
    },
  });

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

  const shouldBlockGameplayKey = (): boolean => {
    if (appScreen === "playing") {
      return !game || paused || game.getSnapshot().gameOver || spinBlocksInput();
    }
    if (appScreen === "settings") {
      return !testGame || testGame.getSnapshot().gameOver;
    }
    return true;
  };

  let settingsScreen: SettingsScreen | null = null;
  let playingScreen: PlayingScreen | null = null;

  const navigate = (nextScreen: AppScreen): void => {
    appScreen = nextScreen;
    landingScreen.classList.toggle("screen--active", nextScreen === "landing");
    authScreenEl.classList.toggle("screen--active", nextScreen === "auth");
    setupScreen.classList.toggle("screen--active", nextScreen === "setup");
    gameScreen.classList.toggle("screen--active", nextScreen === "playing");
    settingsScreenEl.classList.toggle("screen--active", nextScreen === "settings");

    if (nextScreen !== "playing") {
      paused = true;
      playingScreen?.setTipsOpen(false);
    }

    if (nextScreen === "settings") {
      settingsScreen?.enter();
    } else {
      settingsScreen?.leave();
    }

    syncInputControllerState();
  };

  const authScreen: AuthScreen = initAuthScreen({
    authBackButton,
    authHeading,
    authForm,
    authLoginTab,
    authSignupTab,
    authEmail,
    authPassword,
    authUsernameRow,
    authUsername,
    authStatus,
    authSubmitButton,
    guestPlayButton,
    supabase,
    session,
    navigate,
  });

  playingScreen = initPlayingScreen({
    canvas,
    backToSetupButton,
    tipsButton,
    tipsPopover,
    gameActions,
    gameTitle,
    renderer,
    hudUpdater,
    gameplayController,
    supabase,
    session,
    getAppScreen: () => appScreen,
    getSelectedMode: () => selectedMode,
    getSelectedBoard: () => selectedBoard,
    getGame: () => game,
    setGame: (next) => {
      game = next;
    },
    getPaused: () => paused,
    setPaused: (next) => {
      paused = next;
      syncInputControllerState();
    },
    navigate,
    resetLastFrameTime: () => {
      last = performance.now();
    },
    syncInputControllerState,
    shouldBlockGameplayKey,
    blockHandledKeys,
  });

  settingsScreen = initSettingsScreen({
    settingsBackButton,
    settingsCanvas,
    dasSlider,
    arrSlider,
    dcdSlider,
    sdfSlider,
    dasValue,
    arrValue,
    dcdValue,
    sdfValue,
    settingsResetButton,
    miniRenderer,
    testController,
    getAppScreen: () => appScreen,
    getTestGame: () => testGame,
    setTestGame: (next) => {
      testGame = next;
    },
    getSettingsTestFocused: () => settingsTestFocused,
    setSettingsTestFocused: (next) => {
      settingsTestFocused = next;
    },
    getInputSettings: () => inputSettings,
    applyInputSettings,
    navigate,
    syncInputControllerState,
    shouldBlockGameplayKey,
    blockHandledKeys,
  });

  initLandingScreen({
    soloButton,
    authButton,
    signOutButton,
    authSummaryText,
    settingsButton,
    supabase,
    session,
    navigate,
    openAuthLogin: authScreen.openLogin,
  });

  initSetupScreen({
    backToLandingButton,
    startGameButton,
    modeButtons,
    spinnyToggleButton,
    initialSpinnyOn,
    navigate,
    setSelectedMode: (next) => {
      selectedMode = next;
    },
    setSelectedBoard: (next) => {
      selectedBoard = next;
      try {
        window.localStorage.setItem(SPINNY_BOARD_PREF_KEY, next === "ring" ? "1" : "0");
      } catch {
        // localStorage unavailable; ignore.
      }
    },
    startGame: playingScreen.startGame,
  });

  const runLayoutResizeCallbacks = (): void => {
    playingScreen?.onResize();
    settingsScreen?.onResize();
  };

  window.addEventListener("resize", runLayoutResizeCallbacks);
  window.visualViewport?.addEventListener("resize", runLayoutResizeCallbacks);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    // When backgrounded, pause so timers/simulation don't jump on return.
    if (appScreen === "playing" && !paused) {
      paused = true;
      playingScreen?.setTipsOpen(false);
      syncInputControllerState();
    }
  });

  const MAX_FRAME_DT_MS = 50;

  const boardSlot = canvas.parentElement;
  if (boardSlot instanceof HTMLElement) {
    const boardSlotResizeObserver = new ResizeObserver(runLayoutResizeCallbacks);
    boardSlotResizeObserver.observe(boardSlot);
  }

  const loop = (now: number) => {
    if (document.hidden) {
      last = now;
      requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(MAX_FRAME_DT_MS, now - last);
    last = now;
    playingScreen?.stepFrame(dt);
    settingsScreen?.stepFrame(dt);
    syncInputControllerState();
    playingScreen?.drawFrame(dt);
    settingsScreen?.drawFrame(dt);
    requestAnimationFrame(loop);
  };

  applyInputSettings(inputSettings);
  authScreen.refreshAuthModeUi();
  session.refreshAuthSummary();
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      void session.syncAuthState(data.session?.user ?? null);
    });
    supabase.auth.onAuthStateChange((_event, sessionData) => {
      void session.syncAuthState(sessionData?.user ?? null);
    });
  }
  navigate("landing");
  requestAnimationFrame(loop);
};

export { mountApp };
