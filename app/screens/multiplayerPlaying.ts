import { createBoard } from "@game/board/factory";
import { Game, type RunSummary } from "@game/game";
import type { GameConfigOverrides } from "@game/game/rules";
import type { PieceType } from "@game/piece";
import { createSeededRandom } from "@game/random";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { InputController } from "../../input/controller";
import type { HudUpdater } from "../../render/hudPanels";
import { drawHoldPiece, drawNextPieces } from "../../render/miniPiecePainter";
import type { RemoteBoardRenderer } from "../../render/remoteBoard";
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
  opponentRenderer: RemoteBoardRenderer;
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
    typeof maybe.fullWidth === "number" &&
    typeof maybe.fullHeight === "number" &&
    typeof maybe.viewOffsetX === "number" &&
    typeof maybe.viewOffsetY === "number" &&
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

const renderOpponentHold = (type: PieceType | null): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  drawHoldPiece(canvas, type);
  return canvas;
};

const renderOpponentNext = (next: PieceType[]): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  drawNextPieces(canvas, next);
  return canvas;
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
  opponentRenderer,
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
    opponentRenderer.reset();
    opponentHold.replaceChildren(renderOpponentHold(null));
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
    opponentHold.replaceChildren(renderOpponentHold(payload.hold));
    opponentNext.replaceChildren(renderOpponentNext(payload.next));
    opponentRenderer.sync(payload, canvas);
    opponentRenderer.draw(payload);
  };

  /** Before any opponent snapshot, size the empty opponent frame like the local board. */
  const syncOpponentBoardShellFromLocalGame = (): void => {
    if (lastOpponentPayload) return;
    const game = getGame();
    if (!game) return;
    const snap = game.getSnapshot();
    const frame = {
      width: snap.width,
      height: snap.height,
      fullWidth: snap.locked[0]?.length ?? snap.width,
      fullHeight: snap.locked.length,
      viewOffsetX: snap.viewOffsetX,
      viewOffsetY: snap.viewOffsetY,
      cells: [],
    };
    opponentRenderer.sync(frame, canvas);
    opponentRenderer.draw(frame);
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
      opponentRenderer.sync(lastOpponentPayload, canvas);
      opponentRenderer.draw(lastOpponentPayload);
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
