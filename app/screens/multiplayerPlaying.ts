import { createBoard } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import type { GameConfigOverrides } from "@game/game/rules";
import { Piece, type PieceType } from "@game/piece";
import { createSeededRandom } from "@game/random";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { InputController } from "../../input/controller";
import { BOARD_CELL_SIZE, BOARD_PADDING } from "../../render/boardCanvasLayout";
import type { HudUpdater } from "../../render/hudPanels";
import { PIECE_STYLES } from "../../render/pieceStyles";
import type { createRenderer } from "../../render/renderer";
import { buildMultiplayerSnapshot, isMultiplayerCell, type MultiplayerSnapshotPayload } from "../multiplayer/snapshots";
import type { MultiplayerRoom } from "../multiplayer/rooms";
import { buildRunSummaryViewModel } from "../runSummary";
import type { SessionController } from "../session";
import type { AppScreen } from "../constants";
import { MODE_LABELS, RECTANGULAR_BOARD_CONFIG, SPRINT_TARGET_CLEARS } from "../constants";

type Renderer = ReturnType<typeof createRenderer>;

type MultiplayerPlayingScreenOptions = {
  canvas: HTMLCanvasElement;
  backToLobbyButton: HTMLButtonElement;
  tipsButton: HTMLButtonElement;
  tipsPopover: HTMLElement;
  gameActions: HTMLElement;
  gameTitle: HTMLElement;
  opponentBoard: HTMLElement;
  opponentStatus: HTMLElement;
  opponentHold: HTMLElement;
  opponentNext: HTMLElement;
  opponentLines: HTMLElement;
  opponentScore: HTMLElement;
  opponentGarbage: HTMLElement;
  countdownEl: HTMLElement;
  runSummaryEl: HTMLElement;
  runSummaryHeadline: HTMLElement;
  runSummarySubhead: HTMLElement;
  runSummaryPrimaryLabel: HTMLElement;
  runSummaryPrimaryValue: HTMLElement;
  runSummaryStats: HTMLElement;
  runSummaryLobbyButton: HTMLButtonElement;
  renderer: Renderer;
  hudUpdater: HudUpdater;
  gameplayController: InputController;
  supabase: SupabaseClient | null;
  session: SessionController;
  getAppScreen: () => AppScreen;
  getGame: () => Game | null;
  setGame: (game: Game | null) => void;
  navigate: (screen: AppScreen) => void;
  resetLastFrameTime: () => void;
  syncInputControllerState: () => void;
  setGameplayBlocked: (blocked: boolean) => void;
  shouldBlockGameplayKey: () => boolean;
  blockHandledKeys: (e: KeyboardEvent) => void;
  leaveMultiplayerRoom: () => Promise<void>;
  setLobbyAutoStartEnabled: (enabled: boolean) => void;
};

type MultiplayerPlayingScreen = {
  startMultiplayerGame: (room: MultiplayerRoom, serverNowMs?: number) => void;
  setTipsOpen: (open: boolean) => void;
  stepFrame: (dtMs: number) => void;
  drawFrame: (dtMs: number) => void;
  onResize: () => void;
};

const SNAPSHOT_BROADCAST_INTERVAL_MS = 150;
const OPPONENT_STALE_MS = 3_000;
/** Must stay aligned with `MIN_DISPLAY_SCALE` in `render/renderer.ts`. */
const MIN_BOARD_DISPLAY_SCALE = 0.55;

const parseCssPx = (value: string): number | null => {
  const match = /^([\d.]+)px\s*$/i.exec(value.trim());
  if (!match) return null;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const applyPieceStyleVars = (el: HTMLElement, type: PieceType): void => {
  const style = PIECE_STYLES[type];
  el.style.setProperty("--piece-fill", style.fill);
  el.style.setProperty("--piece-edge", style.edge);
  el.style.setProperty("--piece-glow", style.glow);
};

const isPieceType = (value: unknown): value is PieceType =>
  value === "I" || value === "J" || value === "L" || value === "O" || value === "S" || value === "T" || value === "Z";

const isSnapshotPayload = (payload: unknown, roomId: string): payload is MultiplayerSnapshotPayload => {
  if (!payload || typeof payload !== "object") return false;
  const maybe = payload as Partial<MultiplayerSnapshotPayload>;
  return (
    maybe.version === 2 &&
    maybe.roomId === roomId &&
    typeof maybe.userId === "string" &&
    typeof maybe.username === "string" &&
    typeof maybe.width === "number" &&
    typeof maybe.height === "number" &&
    typeof maybe.score === "number" &&
    typeof maybe.lines === "number" &&
    typeof maybe.incomingGarbage === "number" &&
    (maybe.hold === null || isPieceType(maybe.hold)) &&
    Array.isArray(maybe.next) &&
    maybe.next.every(isPieceType) &&
    Array.isArray(maybe.cells) &&
    maybe.cells.every(isMultiplayerCell)
  );
};

const renderOpponentPiece = (type: PieceType | null): HTMLElement => {
  const pieceEl = document.createElement("div");
  pieceEl.className = "opponent-piece";
  pieceEl.setAttribute("aria-label", type ?? "Empty");
  if (!type) return pieceEl;

  const shape = new Piece(type, 0, 0).getShape(0);
  for (const row of shape) {
    for (const occupied of row) {
      const cell = document.createElement("div");
      cell.className = "opponent-piece-cell";
      if (occupied) {
        cell.dataset.value = type;
        applyPieceStyleVars(cell, type);
      }
      pieceEl.append(cell);
    }
  }
  return pieceEl;
};

const makeGameConfig = (room: MultiplayerRoom): GameConfigOverrides => ({
  ...(room.settings.boardKind === "rectangular" ? { board: RECTANGULAR_BOARD_CONFIG } : {}),
  mode: {
    kind: "versus",
    sprintTargetClears: SPRINT_TARGET_CLEARS[room.settings.boardKind],
  },
});

const initMultiplayerPlayingScreen = ({
  canvas,
  backToLobbyButton,
  tipsButton,
  tipsPopover,
  gameActions,
  gameTitle,
  opponentBoard,
  opponentStatus,
  opponentHold,
  opponentNext,
  opponentLines,
  opponentScore,
  opponentGarbage,
  countdownEl,
  runSummaryEl,
  runSummaryHeadline,
  runSummarySubhead,
  runSummaryPrimaryLabel,
  runSummaryPrimaryValue,
  runSummaryStats,
  runSummaryLobbyButton,
  renderer,
  hudUpdater,
  gameplayController,
  supabase,
  session,
  getAppScreen,
  getGame,
  setGame,
  navigate,
  resetLastFrameTime,
  syncInputControllerState,
  setGameplayBlocked,
  shouldBlockGameplayKey,
  blockHandledKeys,
  leaveMultiplayerRoom,
  setLobbyAutoStartEnabled,
}: MultiplayerPlayingScreenOptions): MultiplayerPlayingScreen => {
  let runDurationMs = 0;
  let completedRunShown = false;
  let countdownRemainingMs = 0;
  let countdownEndsAtMs: number | null = null;
  let activeRoom: MultiplayerRoom | null = null;
  let multiplayerChannel: RealtimeChannel | null = null;
  let lastSnapshotBroadcastMs = 0;
  let opponentLastSeenMs = 0;
  let lastOpponentPayload: MultiplayerSnapshotPayload | null = null;

  const syncCountdownRemaining = (): void => {
    if (countdownEndsAtMs === null) return;
    countdownRemainingMs = Math.max(0, countdownEndsAtMs - performance.now());
    if (countdownRemainingMs <= 0) countdownEndsAtMs = null;
  };

  const countdownActive = (): boolean => {
    syncCountdownRemaining();
    return countdownRemainingMs > 0;
  };

  const countdownPending = (): boolean => countdownRemainingMs > 0 || countdownEndsAtMs !== null;

  const renderCountdown = (): void => {
    if (!countdownActive()) {
      countdownEl.hidden = true;
      countdownEl.textContent = "";
      return;
    }
    countdownEl.hidden = false;
    countdownEl.textContent = String(Math.max(1, Math.ceil(countdownRemainingMs / 1000)));
  };

  const beginCountdownMs = (durationMs: number): void => {
    countdownRemainingMs = Math.max(0, durationMs);
    countdownEndsAtMs = countdownRemainingMs > 0 ? performance.now() + countdownRemainingMs : null;
    setGameplayBlocked(countdownActive());
    renderCountdown();
    syncInputControllerState();
  };

  const clearCountdown = (): void => {
    countdownRemainingMs = 0;
    countdownEndsAtMs = null;
    setGameplayBlocked(false);
    renderCountdown();
    syncInputControllerState();
  };

  const setTipsOpen = (open: boolean): void => {
    tipsPopover.hidden = !open;
    tipsButton.setAttribute("aria-expanded", String(open));
  };

  const resetOpponentPanel = (): void => {
    opponentLastSeenMs = 0;
    lastOpponentPayload = null;
    opponentBoard.replaceChildren();
    opponentBoard.style.removeProperty("grid-template-columns");
    opponentBoard.style.removeProperty("grid-template-rows");
    opponentBoard.style.removeProperty("width");
    opponentBoard.style.removeProperty("height");
    opponentBoard.style.removeProperty("padding");
    const resetPanel = opponentHold.closest("#mp-opponent-panel");
    if (resetPanel instanceof HTMLElement) {
      resetPanel.style.removeProperty("--mp-board-cell");
    }
    opponentHold.replaceChildren(renderOpponentPiece(null));
    opponentNext.replaceChildren();
    opponentStatus.textContent = "Waiting";
    opponentLines.textContent = "0";
    opponentScore.textContent = "0";
    opponentGarbage.textContent = "0";
  };

  const hideRunSummary = (): void => {
    runSummaryEl.hidden = true;
    runSummaryStats.replaceChildren();
    setGameplayBlocked(countdownActive());
    syncInputControllerState();
  };

  const showRunSummary = (summary: RunSummary, durationMs: number): void => {
    const boardKind = activeRoom?.settings.boardKind ?? "rectangular";
    const view = buildRunSummaryViewModel(summary, durationMs, boardKind);
    runSummarySubhead.textContent = view.subhead;
    runSummaryHeadline.textContent = view.headline;
    runSummaryPrimaryLabel.textContent = view.primaryLabel;
    runSummaryPrimaryValue.textContent = view.primaryValue;
    runSummaryStats.replaceChildren(
      ...view.stats.map((stat) => {
        const item = document.createElement("div");
        const label = document.createElement("dt");
        const value = document.createElement("dd");
        label.textContent = stat.label;
        value.textContent = stat.value;
        item.append(label, value);
        return item;
      }),
    );
    runSummaryEl.hidden = false;
    runSummaryEl.focus();
    setGameplayBlocked(true);
    syncInputControllerState();
  };

  const renderOpponentSnapshot = (payload: MultiplayerSnapshotPayload): void => {
    lastOpponentPayload = payload;
    opponentLastSeenMs = performance.now();
    opponentStatus.textContent = payload.gameOver ? `${payload.username} out` : payload.username;
    opponentLines.textContent = String(payload.lines);
    opponentScore.textContent = String(payload.score);
    opponentGarbage.textContent = String(payload.incomingGarbage);
    opponentHold.replaceChildren(renderOpponentPiece(payload.hold));
    opponentNext.replaceChildren(...payload.next.map(renderOpponentPiece));
    opponentBoard.style.gridTemplateColumns = `repeat(${payload.width}, minmax(0, 1fr))`;
    opponentBoard.style.gridTemplateRows = `repeat(${payload.height}, minmax(0, 1fr))`;
    syncOpponentBoardSize(payload);

    const cellValues = new Map(payload.cells.map((cell) => [`${cell.x},${cell.y}`, cell.value]));
    const cells: HTMLElement[] = [];
    for (let y = 0; y < payload.height; y += 1) {
      for (let x = 0; x < payload.width; x += 1) {
        const cell = document.createElement("div");
        cell.className = "opponent-cell";
        const value = cellValues.get(`${x},${y}`);
        if (value) {
          cell.dataset.value = value;
          if (value !== "solid") applyPieceStyleVars(cell, value);
        }
        cells.push(cell);
      }
    }
    opponentBoard.replaceChildren(...cells);
  };

  /** Match the opponent DOM board box to the main canvas CSS box (same uniform scale as `setCanvasSize`). */
  const matchCanvasToLogicalBox = (
    logicalWidth: number,
    logicalHeight: number,
  ): { cssWidth: number; cssHeight: number; scale: number } => {
    const styleW = parseCssPx(canvas.style.width);
    const styleH = parseCssPx(canvas.style.height);
    if (styleW !== null && styleH !== null) {
      const sx = styleW / logicalWidth;
      const sy = styleH / logicalHeight;
      const scale = Math.abs(sx - sy) <= 0.002 ? sx : (sx + sy) / 2;
      return { cssWidth: Math.round(styleW), cssHeight: Math.round(styleH), scale };
    }
    const slot = canvas.parentElement;
    if (slot instanceof HTMLElement && slot.clientWidth > 0 && slot.clientHeight > 0) {
      const raw = Math.min(1, slot.clientWidth / logicalWidth, slot.clientHeight / logicalHeight);
      const scale = Math.max(MIN_BOARD_DISPLAY_SCALE, raw);
      return {
        cssWidth: Math.round(logicalWidth * scale),
        cssHeight: Math.round(logicalHeight * scale),
        scale,
      };
    }
    const rect = canvas.getBoundingClientRect();
    const rw = rect.width > 0 ? rect.width : logicalWidth * MIN_BOARD_DISPLAY_SCALE;
    const rh = rect.height > 0 ? rect.height : logicalHeight * MIN_BOARD_DISPLAY_SCALE;
    const raw = Math.min(1, rw / logicalWidth, rh / logicalHeight);
    const scale = Math.max(MIN_BOARD_DISPLAY_SCALE, raw);
    return {
      cssWidth: Math.round(logicalWidth * scale),
      cssHeight: Math.round(logicalHeight * scale),
      scale,
    };
  };

  const applyOpponentBoardChrome = (playWidth: number, playHeight: number): void => {
    const logicalWidth = playWidth * BOARD_CELL_SIZE + BOARD_PADDING * 2;
    const logicalHeight = playHeight * BOARD_CELL_SIZE + BOARD_PADDING * 2;
    const { cssWidth, cssHeight, scale } = matchCanvasToLogicalBox(logicalWidth, logicalHeight);
    opponentBoard.style.width = `${cssWidth}px`;
    opponentBoard.style.height = `${cssHeight}px`;
    opponentBoard.style.padding = `${Math.round(BOARD_PADDING * scale)}px`;
    const panel = opponentHold.closest("#mp-opponent-panel");
    if (panel instanceof HTMLElement) {
      panel.style.setProperty("--mp-board-cell", `${BOARD_CELL_SIZE * scale}px`);
    }
  };

  /** Before any opponent snapshot, size the empty opponent frame like the local board. */
  const syncOpponentBoardShellFromLocalGame = (): void => {
    if (lastOpponentPayload) return;
    const game = getGame();
    if (!game) return;
    const snap = game.getSnapshot();
    applyOpponentBoardChrome(snap.width, snap.height);
  };

  const syncOpponentBoardSize = (payload = lastOpponentPayload): void => {
    if (!payload) return;
    applyOpponentBoardChrome(payload.width, payload.height);
  };

  const teardownMultiplayerChannel = (): void => {
    if (multiplayerChannel && supabase) {
      void supabase.removeChannel(multiplayerChannel);
    }
    multiplayerChannel = null;
    lastSnapshotBroadcastMs = 0;
    resetOpponentPanel();
  };

  const setupMultiplayerChannel = (roomId: string): void => {
    if (!supabase) return;
    teardownMultiplayerChannel();
    multiplayerChannel = supabase
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "snapshot" }, ({ payload }) => {
        if (!isSnapshotPayload(payload, roomId)) return;
        const currentUser = session.getCurrentUser();
        if (payload.userId === currentUser?.id) return;
        renderOpponentSnapshot(payload);
      })
      .subscribe();
  };

  const startMultiplayerGame = (room: MultiplayerRoom, serverNowMs?: number): void => {
    activeRoom = room;
    const random = createSeededRandom(room.seed ?? room.id);
    const game = new Game({
      boardFactory: (width, height, boardRandom) => createBoard(room.settings.boardKind, width, height, boardRandom),
      config: makeGameConfig(room),
      random,
      deferFirstSpawn: true,
    });

    setGame(game);
    runDurationMs = 0;
    completedRunShown = false;
    hideRunSummary();
    resetOpponentPanel();
    gameTitle.textContent = `Multiplayer / ${MODE_LABELS.versus}`;
    hudUpdater.configure("versus", SPRINT_TARGET_CLEARS[room.settings.boardKind]);
    navigate("multiplayer-playing");
    renderer.syncGameConfig(game);
    syncOpponentBoardShellFromLocalGame();
    requestAnimationFrame(() => {
      renderer.syncGameConfig(game);
      syncOpponentBoardShellFromLocalGame();
    });
    renderer.reset(game.getSnapshot().boardRotation);
    setupMultiplayerChannel(room.id);

    const startsAtMs = Date.parse(room.countdownStartsAt ?? "");
    beginCountdownMs(Number.isFinite(startsAtMs) ? Math.max(0, startsAtMs - (serverNowMs ?? Date.now())) : 0);
    if (!countdownActive()) {
      game.beginRun();
      setGameplayBlocked(false);
      syncInputControllerState();
    }
    resetLastFrameTime();
    canvas.focus();
  };

  const handleGlobalKeys = (e: KeyboardEvent): boolean => {
    if (e.code === "Escape" && !tipsPopover.hidden) {
      setTipsOpen(false);
      e.preventDefault();
      return true;
    }
    if (getAppScreen() !== "multiplayer-playing") return false;
    return false;
  };

  const leaveMatch = (): void => {
    const leave = async (): Promise<void> => {
      try {
        await leaveMultiplayerRoom();
      } catch (error) {
        console.warn("Could not leave room", error);
        return;
      }
      clearCountdown();
      hideRunSummary();
      teardownMultiplayerChannel();
      navigate("multiplayer");
    };
    void leave();
  };

  const returnToLobbyAfterMatch = (): void => {
    clearCountdown();
    hideRunSummary();
    teardownMultiplayerChannel();
    setLobbyAutoStartEnabled(false);
    navigate("lobby");
  };

  canvas.addEventListener("click", () => canvas.focus());
  backToLobbyButton.addEventListener("click", () => leaveMatch());
  runSummaryLobbyButton.addEventListener("click", () => returnToLobbyAfterMatch());
  tipsButton.addEventListener("click", () => setTipsOpen(!!tipsPopover.hidden));
  document.addEventListener("click", (e) => {
    if (tipsPopover.hidden || gameActions.contains(e.target as Node)) return;
    setTipsOpen(false);
  });

  canvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (handleGlobalKeys(e)) return;
    if (getAppScreen() !== "multiplayer-playing") {
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });

  const stepFrame = (dtMs: number): void => {
    const game = getGame();
    if (getAppScreen() === "multiplayer-playing" && game && countdownPending()) {
      syncCountdownRemaining();
      if (!countdownActive()) {
        game.beginRun();
        setGameplayBlocked(false);
        resetLastFrameTime();
        syncInputControllerState();
      }
      renderCountdown();
      return;
    }
    if (getAppScreen() === "multiplayer-playing" && game) {
      runDurationMs += dtMs;
      game.tick(dtMs);
      renderer.updateRotation(game.getSnapshot().boardRotation, dtMs);
    }
  };

  const drawFrame = (dtMs: number): void => {
    const game = getGame();
    const room = activeRoom;
    if (getAppScreen() !== "multiplayer-playing" || !game || !room) return;
    const snap = game.getSnapshot();
    gameplayController.update(dtMs, snap.gravityIntervalMs);
    renderer.draw(game, false);
    hudUpdater.update(snap);

    if (multiplayerChannel) {
      const now = performance.now();
      if (now - lastSnapshotBroadcastMs >= SNAPSHOT_BROADCAST_INTERVAL_MS) {
        lastSnapshotBroadcastMs = now;
        const user = session.getCurrentUser();
        if (user) {
          const payload = buildMultiplayerSnapshot(room.id, user.id, session.getCurrentUsername() ?? user.email ?? "player", snap);
          void multiplayerChannel.send({ type: "broadcast", event: "snapshot", payload });
        }
      }
      if (opponentLastSeenMs > 0 && now - opponentLastSeenMs > OPPONENT_STALE_MS) {
        opponentStatus.textContent = "Opponent stale";
      }
    }

    const summary = game.getRunSummary(runDurationMs);
    if (summary.gameOver && !completedRunShown) {
      completedRunShown = true;
      showRunSummary(summary, runDurationMs);
    }
  };

  const onResize = (): void => {
    const game = getGame();
    if (!game) return;
    renderer.syncGameConfig(game);
    if (lastOpponentPayload) {
      syncOpponentBoardSize();
    } else {
      syncOpponentBoardShellFromLocalGame();
    }
  };

  syncInputControllerState();

  return {
    startMultiplayerGame,
    setTipsOpen,
    stepFrame,
    drawFrame,
    onResize,
  };
};

export { initMultiplayerPlayingScreen };
export type { MultiplayerPlayingScreen };
