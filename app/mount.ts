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
import { createRemoteBoardRenderer } from "../render/remoteBoard";
import { createRenderer } from "../render/renderer";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import { DEFAULT_BOARD_KIND, DEFAULT_GAME_MODE, SPINNY_BOARD_PREF_KEY, type AppScreen } from "./constants";
import { getElement } from "./dom";
import { getCanvas2d, getHudElements } from "./mountDom";
import { leaveRoom } from "./multiplayer/rooms";
import { createSessionController } from "./session";
import { initAuthScreen } from "./screens/auth";
import type { AuthScreen } from "./screens/auth";
import { initLandingScreen } from "./screens/landing";
import { initLobbyScreen } from "./screens/lobby";
import type { LobbyScreen } from "./screens/lobby";
import { initLocalBotsPlayingScreen } from "./screens/localBotsPlaying";
import type { LocalBotsPlayingScreen } from "./screens/localBotsPlaying";
import { initLocalBotsSetupScreen } from "./screens/localBotsSetup";
import type { LocalBotSlotControls } from "./screens/localBotsSetup";
import { getDefaultLocalBotSlots, type LocalBotSlotConfig } from "./localBots/config";
import { initMultiplayerScreen } from "./screens/multiplayer";
import type { MultiplayerScreen } from "./screens/multiplayer";
import { initMultiplayerPlayingScreen } from "./screens/multiplayerPlaying";
import type { MultiplayerPlayingScreen } from "./screens/multiplayerPlaying";
import { initPlayingScreen } from "./screens/playing";
import type { PlayingScreen } from "./screens/playing";
import { initSettingsScreen } from "./screens/settings";
import type { SettingsScreen } from "./screens/settings";
import { initSetupScreen } from "./screens/setup";
import { initStatsScreen } from "./screens/stats";
import type { StatsScreen } from "./screens/stats";

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
  const botsSetupScreenEl = getElement<HTMLElement>("bots-setup-screen");
  const botsGameScreenEl = getElement<HTMLElement>("bots-game-screen");
  const settingsScreenEl = getElement<HTMLElement>("settings-screen");
  const statsScreenEl = getElement<HTMLElement>("stats-screen");
  const multiplayerScreenEl = getElement<HTMLElement>("multiplayer-screen");
  const lobbyScreenEl = getElement<HTMLElement>("lobby-screen");
  const multiplayerPlayingScreenEl = getElement<HTMLElement>("mp-game-screen");

  const soloButton = getElement<HTMLButtonElement>("solo-button");
  const authButton = getElement<HTMLButtonElement>("auth-button");
  const signOutButton = getElement<HTMLButtonElement>("sign-out-button");
  const authSummaryText = getElement<HTMLElement>("auth-summary-text");
  const statsButton = getElement<HTMLButtonElement>("stats-button");
  const multiplayerButton = getElement<HTMLButtonElement>("multiplayer-button");
  const settingsButton = getElement<HTMLButtonElement>("settings-button");

  const authBackButton = getElement<HTMLButtonElement>("auth-back-button");
  const authHeading = getElement<HTMLElement>("auth-heading");
  const authForm = getElement<HTMLFormElement>("auth-form");
  const authLoginTab = getElement<HTMLButtonElement>("auth-login-tab");
  const authSignupTab = getElement<HTMLButtonElement>("auth-signup-tab");
  const authPassword = getElement<HTMLInputElement>("auth-password");
  const authUsernameRow = getElement<HTMLLabelElement>("auth-username-row");
  const authUsername = getElement<HTMLInputElement>("auth-username");
  const authStatus = getElement<HTMLElement>("auth-status");
  const authSubmitButton = getElement<HTMLButtonElement>("auth-submit-button");
  const guestPlayButton = getElement<HTMLButtonElement>("guest-play-button");

  const statsBackButton = getElement<HTMLButtonElement>("stats-back-button");
  const statsSignInButton = getElement<HTMLButtonElement>("stats-sign-in-button");
  const statsSetupButton = getElement<HTMLButtonElement>("stats-setup-button");
  const statsStatus = getElement<HTMLElement>("stats-status");
  const statsContent = getElement<HTMLElement>("stats-content");
  const statsAccount = getElement<HTMLElement>("stats-account");
  const statsHeadline = getElement<HTMLElement>("stats-headline");
  const statsBests = getElement<HTMLElement>("stats-bests");
  const statsActivity = getElement<HTMLElement>("stats-activity");
  const statsEmpty = getElement<HTMLElement>("stats-empty");

  const multiplayerBackButton = getElement<HTMLButtonElement>("multiplayer-back-button");
  const multiplayerSignInButton = getElement<HTMLButtonElement>("multiplayer-sign-in-button");
  const publicRoomsTab = getElement<HTMLButtonElement>("public-rooms-tab");
  const privateRoomsTab = getElement<HTMLButtonElement>("private-rooms-tab");
  const botsTab = getElement<HTMLButtonElement>("bots-tab");
  const publicRoomsPanel = getElement<HTMLElement>("public-rooms-panel");
  const privateRoomsPanel = getElement<HTMLElement>("private-rooms-panel");
  const createPublicRoomButton = getElement<HTMLButtonElement>("create-public-room-button");
  const createPrivateRoomButton = getElement<HTMLButtonElement>("create-private-room-button");
  const joinCodeInput = getElement<HTMLInputElement>("join-code-input");
  const joinCodeButton = getElement<HTMLButtonElement>("join-code-button");
  const refreshRoomsButton = getElement<HTMLButtonElement>("refresh-rooms-button");
  const multiplayerStatus = getElement<HTMLElement>("multiplayer-status");
  const multiplayerContent = getElement<HTMLElement>("multiplayer-content");
  const publicRoomsList = getElement<HTMLElement>("public-rooms-list");

  const lobbyLeaveButton = getElement<HTMLButtonElement>("lobby-leave-button");
  const lobbyRefreshButton = getElement<HTMLButtonElement>("lobby-refresh-button");
  const lobbyReadyButton = getElement<HTMLButtonElement>("lobby-ready-button");
  const lobbyStartButton = getElement<HTMLButtonElement>("lobby-start-button");
  const lobbyWatchButton = getElement<HTMLButtonElement>("lobby-watch-button");
  const lobbyStatus = getElement<HTMLElement>("lobby-status");
  const lobbyContent = getElement<HTMLElement>("lobby-content");
  const lobbyHeading = getElement<HTMLElement>("lobby-heading");
  const lobbyCode = getElement<HTMLElement>("lobby-code");
  const lobbyVisibility = getElement<HTMLElement>("lobby-visibility");
  const lobbyRoomStatus = getElement<HTMLElement>("lobby-room-status");
  const lobbyMembers = getElement<HTMLElement>("lobby-members");
  const lobbySpectators = getElement<HTMLElement>("lobby-spectators");

  const backToLandingButton = getElement<HTMLButtonElement>("back-to-landing-button");
  const backToSetupButton = getElement<HTMLButtonElement>("back-to-setup-button");
  const startGameButton = getElement<HTMLButtonElement>("start-game-button");
  const botsSetupBackButton = getElement<HTMLButtonElement>("bots-setup-back-button");
  const startBotsButton = getElement<HTMLButtonElement>("start-bots-button");
  const botSlotControls: LocalBotSlotControls[] = [1, 2, 3].map((slot) => ({
    enabled: getElement<HTMLInputElement>(`bot-slot-${slot}-enabled`),
    type: getElement<HTMLSelectElement>(`bot-slot-${slot}-type`),
    ppsSlider: getElement<HTMLInputElement>(`bot-slot-${slot}-pps`),
    ppsValue: getElement<HTMLElement>(`bot-slot-${slot}-pps-value`),
    row: getElement<HTMLElement>(`bot-slot-${slot}-row`),
  }));
  const botsBackButton = getElement<HTMLButtonElement>("bots-back-button");
  const botsGameTitle = getElement<HTMLElement>("bots-game-title");
  const botsPlayArea = getElement<HTMLElement>("bots-play-area");
  const botsOpponentStation = getElement<HTMLElement>("bots-opponent-station");
  const botsHumanBoard = getCanvas2d("bots-human-game");
  if (!botsHumanBoard) return;
  const { canvas: botsHumanCanvas, ctx: botsHumanCtx } = botsHumanBoard;
  const botsBotBoard = getCanvas2d("bots-bot-game");
  if (!botsBotBoard) return;
  const { canvas: botsBotCanvas, ctx: botsBotCtx } = botsBotBoard;
  const botsHumanHudElements = getHudElements({
    holdCanvas: "bots-human-hold-canvas",
    nextCanvas: "bots-human-next-canvas",
    timerEl: "bots-human-timer",
    linesRow: "bots-human-lines-row",
    linesValue: "bots-human-lines",
    scoreRow: "bots-human-score-row",
    scoreValue: "bots-human-score",
    levelRow: "bots-human-level-row",
    levelValue: "bots-human-level",
    ppsRow: "bots-human-pps-row",
    ppsValue: "bots-human-pps",
    comboRow: "bots-human-combo-row",
    comboValue: "bots-human-combo",
    survivalRow: "bots-human-survival-row",
    survivalValue: "bots-human-survival",
  });
  const botsBotHudElements = getHudElements({
    holdCanvas: "bots-bot-hold-canvas",
    nextCanvas: "bots-bot-next-canvas",
    timerEl: "bots-bot-timer",
    linesRow: "bots-bot-lines-row",
    linesValue: "bots-bot-lines",
    scoreRow: "bots-bot-score-row",
    scoreValue: "bots-bot-score",
    levelRow: "bots-bot-level-row",
    levelValue: "bots-bot-level",
    ppsRow: "bots-bot-pps-row",
    ppsValue: "bots-bot-pps",
    comboRow: "bots-bot-combo-row",
    comboValue: "bots-bot-combo",
    survivalRow: "bots-bot-survival-row",
    survivalValue: "bots-bot-survival",
  });
  const botsHumanStatus = getElement<HTMLElement>("bots-human-status");
  const botsBotStatus = getElement<HTMLElement>("bots-bot-status");
  const botsHumanTarget = getElement<HTMLElement>("bots-human-target");
  const botsBotTarget = getElement<HTMLElement>("bots-bot-target");
  const botsHumanGarbageMeter = getElement<HTMLElement>("bots-human-garbage-meter");
  const botsHumanGarbageValue = getElement<HTMLElement>("bots-human-garbage-value");
  const botsBotGarbageMeter = getElement<HTMLElement>("bots-bot-garbage-meter");
  const botsBotGarbageValue = getElement<HTMLElement>("bots-bot-garbage-value");
  const botsResult = getElement<HTMLElement>("bots-result");
  const botsResultHeadline = getElement<HTMLElement>("bots-result-headline");
  const botsResultSubhead = getElement<HTMLElement>("bots-result-subhead");
  const botsResultStats = getElement<HTMLElement>("bots-result-stats");
  const botsRematchButton = getElement<HTMLButtonElement>("bots-rematch-button");
  const botsResultSetupButton = getElement<HTMLButtonElement>("bots-result-setup-button");
  const tipsButton = getElement<HTMLButtonElement>("tips-button");
  const tipsPopover = getElement<HTMLElement>("tips-popover");
  const gameActions = getElement<HTMLElement>("game-actions");
  const gameTitle = getElement<HTMLElement>("game-title");
  const multiplayerOpponentBoard2d = getCanvas2d("mp-opponent-board");
  if (!multiplayerOpponentBoard2d) return;
  const { canvas: multiplayerOpponentBoard, ctx: multiplayerOpponentBoardCtx } = multiplayerOpponentBoard2d;
  const multiplayerOpponentStatus = getElement<HTMLElement>("mp-opponent-status");
  const multiplayerOpponentHold = getElement<HTMLElement>("mp-opponent-hold");
  const multiplayerOpponentNext = getElement<HTMLElement>("mp-opponent-next");
  const multiplayerOpponentLines = getElement<HTMLElement>("mp-opponent-lines");
  const multiplayerOpponentScore = getElement<HTMLElement>("mp-opponent-score");
  const multiplayerOpponentPps = getElement<HTMLElement>("mp-opponent-pps");
  const multiplayerOpponentGarbage = getElement<HTMLElement>("mp-opponent-garbage");
  const countdownEl = getElement<HTMLElement>("run-countdown");
  const runSummaryEl = getElement<HTMLElement>("run-summary");
  const runSummaryHeadline = getElement<HTMLElement>("run-summary-headline");
  const runSummarySubhead = getElement<HTMLElement>("run-summary-subhead");
  const runSummaryPrimaryLabel = getElement<HTMLElement>("run-summary-primary-label");
  const runSummaryPrimaryValue = getElement<HTMLElement>("run-summary-primary-value");
  const runSummaryStats = getElement<HTMLElement>("run-summary-stats");
  const runSummaryRestartButton = getElement<HTMLButtonElement>("run-summary-restart");
  const runSummarySetupButton = getElement<HTMLButtonElement>("run-summary-setup");
  const mpBackToLobbyButton = getElement<HTMLButtonElement>("mp-back-to-lobby-button");
  const mpTipsButton = getElement<HTMLButtonElement>("mp-tips-button");
  const mpTipsPopover = getElement<HTMLElement>("mp-tips-popover");
  const mpGameActions = getElement<HTMLElement>("mp-game-actions");
  const mpGameTitle = getElement<HTMLElement>("mp-game-title");
  const mpCountdownEl = getElement<HTMLElement>("mp-run-countdown");
  const mpRunSummaryEl = getElement<HTMLElement>("mp-run-summary");
  const mpRunSummaryHeadline = getElement<HTMLElement>("mp-run-summary-headline");
  const mpRunSummarySubhead = getElement<HTMLElement>("mp-run-summary-subhead");
  const mpRunSummaryPrimaryLabel = getElement<HTMLElement>("mp-run-summary-primary-label");
  const mpRunSummaryPrimaryValue = getElement<HTMLElement>("mp-run-summary-primary-value");
  const mpRunSummaryStats = getElement<HTMLElement>("mp-run-summary-stats");
  const mpRunSummaryLobbyButton = getElement<HTMLButtonElement>("mp-run-summary-lobby");
  const mpGarbageMeter = getElement<HTMLElement>("mp-garbage-meter");
  const mpGarbageValue = getElement<HTMLElement>("mp-garbage-value");
  const mpOpponentGarbageMeter = getElement<HTMLElement>("mp-opponent-garbage-meter");
  const mpOpponentGarbageValue = getElement<HTMLElement>("mp-opponent-garbage-value");
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button[data-mode]"));
  const spinnyToggleButton = getElement<HTMLButtonElement>("spinny-toggle");
  const gameBoard = getCanvas2d("game");
  if (!gameBoard) return;
  const { canvas, ctx } = gameBoard;
  const multiplayerBoard = getCanvas2d("mp-game");
  if (!multiplayerBoard) return;
  const { canvas: mpCanvas, ctx: mpCtx } = multiplayerBoard;
  const soloHudElements = getHudElements({
    holdCanvas: "hold-canvas",
    nextCanvas: "next-canvas",
    timerEl: "stat-timer",
    linesRow: "stat-lines-row",
    linesValue: "stat-lines",
    scoreRow: "stat-score-row",
    scoreValue: "stat-score",
    levelRow: "stat-level-row",
    levelValue: "stat-level",
    ppsRow: "stat-pps-row",
    ppsValue: "stat-pps",
    comboRow: "stat-combo-row",
    comboValue: "stat-combo",
    survivalRow: "stat-survival-row",
    survivalValue: "stat-survival",
  });
  const multiplayerHudElements = getHudElements({
    holdCanvas: "mp-hold-canvas",
    nextCanvas: "mp-next-canvas",
    timerEl: "mp-stat-timer",
    linesRow: "mp-stat-lines-row",
    linesValue: "mp-stat-lines",
    scoreRow: "mp-stat-score-row",
    scoreValue: "mp-stat-score",
    levelRow: "mp-stat-level-row",
    levelValue: "mp-stat-level",
    ppsRow: "mp-stat-pps-row",
    ppsValue: "mp-stat-pps",
    comboRow: "mp-stat-combo-row",
    comboValue: "mp-stat-combo",
    survivalRow: "mp-stat-survival-row",
    survivalValue: "mp-stat-survival",
  });

  const settingsBackButton = getElement<HTMLButtonElement>("settings-back-button");
  const settingsBoard = getCanvas2d("settings-test-board");
  if (!settingsBoard) return;
  const { canvas: settingsCanvas, ctx: settingsCtx } = settingsBoard;

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
  let currentRoomId: string | null = null;
  let lobbyAutoStartEnabled = true;
  let settingsTestFocused = false;
  let paused = false;
  let gameplayBlocked = false;
  let multiplayerGameplayBlocked = false;
  let localBotsGameplayBlocked = false;
  let localBotSlots: LocalBotSlotConfig[] = getDefaultLocalBotSlots();
  let last = performance.now();

  const supabase = isSupabaseConfigured() ? getSupabase() : null;
  const renderer = createRenderer(canvas, ctx);
  const multiplayerRenderer = createRenderer(mpCanvas, mpCtx);
  const localBotsHumanRenderer = createRenderer(botsHumanCanvas, botsHumanCtx);
  const localBotsBotRenderer = createRenderer(botsBotCanvas, botsBotCtx);
  const multiplayerSpectatorLocalRenderer = createRemoteBoardRenderer(mpCanvas, mpCtx);
  const multiplayerOpponentRenderer = createRemoteBoardRenderer(multiplayerOpponentBoard, multiplayerOpponentBoardCtx);
  const hudUpdater = createHudUpdater(soloHudElements);
  const multiplayerHudUpdater = createHudUpdater(multiplayerHudElements);
  const localBotsHumanHudUpdater = createHudUpdater(botsHumanHudElements);
  const localBotsBotHudUpdater = createHudUpdater(botsBotHudElements);
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

  const multiplayerGameplayController = createInputController(
    () => (game && !game.getSnapshot().gameOver ? gameplayCallbacksFor(game) : null),
    inputSettings,
  );
  let localBotsHumanGame: Game | null = null;
  const localBotsGameplayController = createInputController(
    () => (localBotsHumanGame && !localBotsHumanGame.getSnapshot().gameOver ? gameplayCallbacksFor(localBotsHumanGame) : null),
    inputSettings,
  );

  const testController = createInputController(
    () => (testGame && !testGame.getSnapshot().gameOver ? gameplayCallbacksFor(testGame) : null),
    inputSettings,
  );

  gameplayController.attach(canvas);
  multiplayerGameplayController.attach(mpCanvas);
  localBotsGameplayController.attach(botsHumanCanvas);
  testController.attach(settingsCanvas);

  const applyInputSettings = (next: InputSettings): void => {
    inputSettings = clampInputSettings(next);
    saveInputSettings(inputSettings);
    gameplayController.setSettings(inputSettings);
    multiplayerGameplayController.setSettings(inputSettings);
    localBotsGameplayController.setSettings(inputSettings);
    testController.setSettings(inputSettings);
  };

  const spinBlocksInput = (): boolean => {
    if (appScreen === "playing") return renderer.isSpinAnimating();
    if (appScreen === "multiplayer-playing") return multiplayerRenderer.isSpinAnimating();
    if (appScreen === "bots-playing") return localBotsHumanRenderer.isSpinAnimating();
    return false;
  };

  const syncInputControllerState = (): void => {
    const playing = appScreen === "playing";
    const multiplayerPlaying = appScreen === "multiplayer-playing";
    const botsPlaying = appScreen === "bots-playing";
    const settings = appScreen === "settings";

    gameplayController.setEnabled(
      playing && !paused && !gameplayBlocked && !!game && !game.getSnapshot().gameOver && !spinBlocksInput(),
    );
    multiplayerGameplayController.setEnabled(
      multiplayerPlaying &&
        !multiplayerGameplayBlocked &&
        !!game &&
        !game.getSnapshot().gameOver &&
        !spinBlocksInput(),
    );
    localBotsGameplayController.setEnabled(
      botsPlaying &&
        !localBotsGameplayBlocked &&
        !!localBotsHumanGame &&
        !localBotsHumanGame.getSnapshot().gameOver &&
        !spinBlocksInput(),
    );
    testController.setEnabled(settings && settingsTestFocused && !!testGame && !testGame.getSnapshot().gameOver);
  };

  const shouldBlockGameplayKey = (): boolean => {
    if (appScreen === "playing") {
      return !game || paused || gameplayBlocked || game.getSnapshot().gameOver || spinBlocksInput();
    }
    if (appScreen === "multiplayer-playing") {
      return !game || multiplayerGameplayBlocked || game.getSnapshot().gameOver || spinBlocksInput();
    }
    if (appScreen === "bots-playing") {
      return (
        !localBotsHumanGame ||
        localBotsGameplayBlocked ||
        localBotsHumanGame.getSnapshot().gameOver ||
        spinBlocksInput()
      );
    }
    if (appScreen === "settings") {
      return !testGame || testGame.getSnapshot().gameOver;
    }
    return true;
  };

  let settingsScreen: SettingsScreen | null = null;
  let playingScreen: PlayingScreen | null = null;
  let multiplayerPlayingScreen: MultiplayerPlayingScreen | null = null;
  let localBotsPlayingScreen: LocalBotsPlayingScreen | null = null;
  let statsScreen: StatsScreen | null = null;
  let multiplayerScreen: MultiplayerScreen | null = null;
  let lobbyScreen: LobbyScreen | null = null;

  const navigate = (nextScreen: AppScreen): void => {
    appScreen = nextScreen;
    landingScreen.classList.toggle("screen--active", nextScreen === "landing");
    authScreenEl.classList.toggle("screen--active", nextScreen === "auth");
    setupScreen.classList.toggle("screen--active", nextScreen === "setup");
    gameScreen.classList.toggle("screen--active", nextScreen === "playing");
    botsSetupScreenEl.classList.toggle("screen--active", nextScreen === "bots-setup");
    botsGameScreenEl.classList.toggle("screen--active", nextScreen === "bots-playing");
    settingsScreenEl.classList.toggle("screen--active", nextScreen === "settings");
    statsScreenEl.classList.toggle("screen--active", nextScreen === "stats");
    multiplayerScreenEl.classList.toggle("screen--active", nextScreen === "multiplayer");
    lobbyScreenEl.classList.toggle("screen--active", nextScreen === "lobby");
    multiplayerPlayingScreenEl.classList.toggle("screen--active", nextScreen === "multiplayer-playing");

    if (nextScreen !== "playing") {
      paused = true;
      playingScreen?.setTipsOpen(false);
    }
    if (nextScreen !== "multiplayer-playing") {
      multiplayerPlayingScreen?.setTipsOpen(false);
    }

    if (nextScreen === "settings") {
      settingsScreen?.enter();
    } else {
      settingsScreen?.leave();
    }

    if (nextScreen === "stats") {
      statsScreen?.enter();
    }

    if (nextScreen === "multiplayer") {
      multiplayerScreen?.enter();
    }

    if (nextScreen === "lobby") {
      lobbyScreen?.enter();
    } else {
      lobbyScreen?.leave();
    }

    syncInputControllerState();
  };

  const authScreen: AuthScreen = initAuthScreen({
    authBackButton,
    authHeading,
    authForm,
    authLoginTab,
    authSignupTab,
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
    countdownEl,
    runSummaryEl,
    runSummaryHeadline,
    runSummarySubhead,
    runSummaryPrimaryLabel,
    runSummaryPrimaryValue,
    runSummaryStats,
    runSummaryRestartButton,
    runSummarySetupButton,
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
    setGameplayBlocked: (blocked) => {
      gameplayBlocked = blocked;
    },
    shouldBlockGameplayKey,
    blockHandledKeys,
  });

  multiplayerPlayingScreen = initMultiplayerPlayingScreen({
    canvas: mpCanvas,
    backToLobbyButton: mpBackToLobbyButton,
    tipsButton: mpTipsButton,
    tipsPopover: mpTipsPopover,
    gameActions: mpGameActions,
    gameTitle: mpGameTitle,
    opponentRenderer: multiplayerOpponentRenderer,
    opponentStatus: multiplayerOpponentStatus,
    opponentHold: multiplayerOpponentHold,
    opponentNext: multiplayerOpponentNext,
    opponentLines: multiplayerOpponentLines,
    opponentScore: multiplayerOpponentScore,
    opponentPps: multiplayerOpponentPps,
    opponentGarbage: multiplayerOpponentGarbage,
    localHoldCanvas: multiplayerHudElements.holdCanvas,
    localNextCanvas: multiplayerHudElements.nextCanvas,
    localStatus: multiplayerHudElements.timerEl,
    localLines: multiplayerHudElements.linesValue,
    localScore: multiplayerHudElements.scoreValue,
    localPps: multiplayerHudElements.ppsValue,
    localCombo: multiplayerHudElements.comboValue,
    countdownEl: mpCountdownEl,
    runSummaryEl: mpRunSummaryEl,
    runSummaryHeadline: mpRunSummaryHeadline,
    runSummarySubhead: mpRunSummarySubhead,
    runSummaryPrimaryLabel: mpRunSummaryPrimaryLabel,
    runSummaryPrimaryValue: mpRunSummaryPrimaryValue,
    runSummaryStats: mpRunSummaryStats,
    runSummaryLobbyButton: mpRunSummaryLobbyButton,
    garbageMeter: mpGarbageMeter,
    garbageValue: mpGarbageValue,
    opponentGarbageMeter: mpOpponentGarbageMeter,
    opponentGarbageValue: mpOpponentGarbageValue,
    spectatorLocalRenderer: multiplayerSpectatorLocalRenderer,
    renderer: multiplayerRenderer,
    hudUpdater: multiplayerHudUpdater,
    gameplayController: multiplayerGameplayController,
    supabase,
    session,
    getAppScreen: () => appScreen,
    getGame: () => game,
    setGame: (next) => {
      game = next;
    },
    navigate,
    resetLastFrameTime: () => {
      last = performance.now();
    },
    syncInputControllerState,
    setGameplayBlocked: (blocked) => {
      multiplayerGameplayBlocked = blocked;
    },
    shouldBlockGameplayKey,
    blockHandledKeys,
    leaveMultiplayerRoom: async () => {
      if (currentRoomId && supabase) {
        await leaveRoom(supabase, currentRoomId);
      }
      currentRoomId = null;
    },
    setLobbyAutoStartEnabled: (enabled) => {
      lobbyAutoStartEnabled = enabled;
    },
  });

  localBotsPlayingScreen = initLocalBotsPlayingScreen({
    humanCanvas: botsHumanCanvas,
    backButton: botsBackButton,
    title: botsGameTitle,
    playArea: botsPlayArea,
    botStation: botsOpponentStation,
    humanRenderer: localBotsHumanRenderer,
    botRenderer: localBotsBotRenderer,
    humanHud: localBotsHumanHudUpdater,
    botHud: localBotsBotHudUpdater,
    humanController: localBotsGameplayController,
    humanStatus: botsHumanStatus,
    botStatus: botsBotStatus,
    humanTarget: botsHumanTarget,
    botTarget: botsBotTarget,
    humanGarbageMeter: botsHumanGarbageMeter,
    humanGarbageValue: botsHumanGarbageValue,
    botGarbageMeter: botsBotGarbageMeter,
    botGarbageValue: botsBotGarbageValue,
    resultEl: botsResult,
    resultHeadline: botsResultHeadline,
    resultSubhead: botsResultSubhead,
    resultStats: botsResultStats,
    rematchButton: botsRematchButton,
    setupButton: botsResultSetupButton,
    getAppScreen: () => appScreen,
    navigate,
    resetLastFrameTime: () => {
      last = performance.now();
    },
    syncInputControllerState,
    setGameplayBlocked: (blocked) => {
      localBotsGameplayBlocked = blocked;
    },
    setHumanGame: (next) => {
      localBotsHumanGame = next;
    },
    getBotSlots: () => localBotSlots,
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

  statsScreen = initStatsScreen({
    statsBackButton,
    statsSignInButton,
    statsSetupButton,
    statsStatus,
    statsContent,
    statsAccount,
    statsHeadline,
    statsBests,
    statsActivity,
    statsEmpty,
    supabase,
    session,
    navigate,
    openAuthLogin: authScreen.openLogin,
  });

  multiplayerScreen = initMultiplayerScreen({
    multiplayerBackButton,
    multiplayerSignInButton,
    publicRoomsTab,
    privateRoomsTab,
    botsTab,
    publicRoomsPanel,
    privateRoomsPanel,
    createPublicRoomButton,
    createPrivateRoomButton,
    joinCodeInput,
    joinCodeButton,
    refreshRoomsButton,
    multiplayerStatus,
    multiplayerContent,
    publicRoomsList,
    supabase,
    session,
    navigate,
    openAuthLogin: authScreen.openLogin,
    setCurrentRoomId: (roomId) => {
      currentRoomId = roomId;
      if (roomId) lobbyAutoStartEnabled = true;
    },
    startSpectatingPublicRoom: (room) => {
      currentRoomId = null;
      lobbyAutoStartEnabled = false;
      multiplayerPlayingScreen?.startSpectatingMatch(room, []);
    },
    startBots: () => navigate("bots-setup"),
  });

  lobbyScreen = initLobbyScreen({
    lobbyLeaveButton,
    lobbyRefreshButton,
    lobbyReadyButton,
    lobbyStartButton,
    lobbyWatchButton,
    lobbyStatus,
    lobbyContent,
    lobbyHeading,
    lobbyCode,
    lobbyVisibility,
    lobbyRoomStatus,
    lobbyMembers,
    lobbySpectators,
    supabase,
    session,
    navigate,
    getCurrentRoomId: () => currentRoomId,
    setCurrentRoomId: (roomId) => {
      currentRoomId = roomId;
      if (roomId) lobbyAutoStartEnabled = true;
    },
    startMultiplayerGame: (room, members, serverNowMs) => {
      multiplayerPlayingScreen?.startMultiplayerGame(room, members, serverNowMs);
    },
    startSpectatingMatch: (room, members) => {
      multiplayerPlayingScreen?.startSpectatingMatch(room, members);
    },
    canAutoStartRoom: () => lobbyAutoStartEnabled,
  });

  initLandingScreen({
    soloButton,
    authButton,
    signOutButton,
    authSummaryText,
    settingsButton,
    statsButton,
    multiplayerButton,
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

  initLocalBotsSetupScreen({
    backButton: botsSetupBackButton,
    startButton: startBotsButton,
    slotControls: botSlotControls,
    navigate,
    setBotSlots: (slots) => {
      localBotSlots = slots;
    },
    startMatch: () => localBotsPlayingScreen?.startMatch(),
  });

  const runLayoutResizeCallbacks = (): void => {
    playingScreen?.onResize();
    multiplayerPlayingScreen?.onResize();
    localBotsPlayingScreen?.onResize();
    settingsScreen?.onResize();
  };

  window.addEventListener("resize", runLayoutResizeCallbacks);
  window.visualViewport?.addEventListener("resize", runLayoutResizeCallbacks);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    // Zen allows manual pause/resume; competitive modes keep the pause architecture internal.
    if (appScreen === "playing" && selectedMode === "zen" && !paused) {
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
  const multiplayerBoardSlot = mpCanvas.parentElement;
  if (multiplayerBoardSlot instanceof HTMLElement) {
    const multiplayerBoardSlotResizeObserver = new ResizeObserver(runLayoutResizeCallbacks);
    multiplayerBoardSlotResizeObserver.observe(multiplayerBoardSlot);
  }
  const botsBoardSlot = botsHumanCanvas.parentElement;
  if (botsBoardSlot instanceof HTMLElement) {
    const botsBoardSlotResizeObserver = new ResizeObserver(runLayoutResizeCallbacks);
    botsBoardSlotResizeObserver.observe(botsBoardSlot);
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
    multiplayerPlayingScreen?.stepFrame(dt);
    localBotsPlayingScreen?.stepFrame(dt);
    settingsScreen?.stepFrame(dt);
    syncInputControllerState();
    playingScreen?.drawFrame(dt);
    multiplayerPlayingScreen?.drawFrame(dt);
    localBotsPlayingScreen?.drawFrame(dt);
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
