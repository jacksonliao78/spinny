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
import {
  applyRemoteGarbageAttack,
  buildMultiplayerAttackPayload,
  createAttackDeduper,
} from "../multiplayer/attacks";
import { buildMultiplayerResultPayload, isMultiplayerResultPayload } from "../multiplayer/results";
import {
  buildMultiplayerSnapshot,
  isMultiplayerSnapshotPayload,
  type MultiplayerSnapshotPayload,
} from "../multiplayer/snapshots";
import type { MultiplayerRoom, RoomMember } from "../multiplayer/rooms";
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
  localHoldCanvas: HTMLCanvasElement;
  localNextCanvas: HTMLCanvasElement;
  localStatus: HTMLElement;
  localLines: HTMLElement;
  localScore: HTMLElement;
  localCombo: HTMLElement;
  countdownEl: HTMLElement;
  runSummaryEl: HTMLElement;
  runSummaryHeadline: HTMLElement;
  runSummarySubhead: HTMLElement;
  runSummaryPrimaryLabel: HTMLElement;
  runSummaryPrimaryValue: HTMLElement;
  runSummaryStats: HTMLElement;
  runSummaryLobbyButton: HTMLButtonElement;
  garbageMeter: HTMLElement;
  garbageValue: HTMLElement;
  opponentGarbageMeter: HTMLElement;
  opponentGarbageValue: HTMLElement;
  spectatorLocalRenderer: RemoteBoardRenderer;
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
  startMultiplayerGame: (room: MultiplayerRoom, members: RoomMember[], serverNowMs?: number) => void;
  startSpectatingMatch: (room: MultiplayerRoom, members: RoomMember[]) => void;
  setTipsOpen: (open: boolean) => void;
  stepFrame: (dtMs: number) => void;
  drawFrame: (dtMs: number) => void;
  onResize: () => void;
};

const SNAPSHOT_BROADCAST_INTERVAL_MS = 150;
const OPPONENT_STALE_MS = 3_000;
const RESULT_RETURN_DELAY_MS = 4_500;

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
  localHoldCanvas,
  localNextCanvas,
  localStatus,
  localLines,
  localScore,
  localCombo,
  countdownEl,
  runSummaryEl,
  runSummaryHeadline,
  runSummarySubhead,
  runSummaryPrimaryLabel,
  runSummaryPrimaryValue,
  runSummaryStats,
  runSummaryLobbyButton,
  garbageMeter,
  garbageValue,
  opponentGarbageMeter,
  opponentGarbageValue,
  spectatorLocalRenderer,
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
  let attackSequence = 0;
  let lastOpponentPayload: MultiplayerSnapshotPayload | null = null;
  let lastSpectatorLeftPayload: MultiplayerSnapshotPayload | null = null;
  let lastSpectatorRightPayload: MultiplayerSnapshotPayload | null = null;
  let matchCompleted = false;
  let resultReturnTimer: number | null = null;
  let playRole: "player" | "spectator" = "player";
  let playerSlot: 1 | 2 | null = null;
  let spectatorPlayerNames: Record<1 | 2, string> = { 1: "Player 1", 2: "Player 2" };
  const attackDeduper = createAttackDeduper();

  const setGarbageMeter = (meter: HTMLElement, valueEl: HTMLElement, amount: number): void => {
    const safeAmount = Math.max(0, Math.floor(amount));
    const level = Math.min(5, Math.ceil(safeAmount / 4));
    meter.dataset.level = String(level);
    valueEl.textContent = safeAmount > 20 ? "20+" : String(safeAmount);
  };

  const clearResultReturnTimer = (): void => {
    if (resultReturnTimer === null) return;
    window.clearTimeout(resultReturnTimer);
    resultReturnTimer = null;
  };

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
    setGarbageMeter(opponentGarbageMeter, opponentGarbageValue, 0);
  };

  const resetSpectatorPanels = (): void => {
    lastSpectatorLeftPayload = null;
    lastSpectatorRightPayload = null;
    if (playRole === "spectator") spectatorLocalRenderer.reset();
    opponentRenderer.reset();
    drawHoldPiece(localHoldCanvas, null);
    drawNextPieces(localNextCanvas, []);
    opponentHold.replaceChildren(renderOpponentHold(null));
    opponentNext.replaceChildren();
    localStatus.textContent = "Player 1";
    localLines.textContent = "0";
    localScore.textContent = "0";
    localCombo.textContent = "0";
    opponentStatus.textContent = "Player 2";
    opponentLines.textContent = "0";
    opponentScore.textContent = "0";
    opponentGarbage.textContent = "0";
    setGarbageMeter(garbageMeter, garbageValue, 0);
    setGarbageMeter(opponentGarbageMeter, opponentGarbageValue, 0);
  };

  const hideRunSummary = (): void => {
    runSummaryEl.hidden = true;
    runSummaryEl.classList.remove("run-summary--win", "run-summary--loss");
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

  const showMatchResult = (won: boolean): void => {
    const game = getGame();
    if (!game || matchCompleted) return;
    matchCompleted = true;
    clearCountdown();
    const summary = game.getRunSummary(runDurationMs);
    const boardKind = activeRoom?.settings.boardKind ?? "rectangular";
    const view = buildRunSummaryViewModel(summary, runDurationMs, boardKind);
    const opponent = lastOpponentPayload;

    runSummarySubhead.textContent = view.subhead;
    runSummaryHeadline.textContent = won ? "You Win" : "You Lose";
    runSummaryPrimaryLabel.textContent = "Result";
    runSummaryPrimaryValue.textContent = won ? "Winner" : "Knocked Out";
    runSummaryStats.replaceChildren(
      ...[
        { label: "Your Lines", value: String(summary.linesClearedTotal) },
        { label: "Your Score", value: String(summary.score) },
        { label: "Pieces", value: String(summary.stats.locksPlaced) },
        { label: "PPS", value: summary.metrics.speed.piecesPerSecond.toFixed(2) },
        { label: "Opponent Lines", value: String(opponent?.lines ?? 0) },
        { label: "Opponent Score", value: String(opponent?.score ?? 0) },
      ].map((stat) => {
        const item = document.createElement("div");
        const label = document.createElement("dt");
        const value = document.createElement("dd");
        label.textContent = stat.label;
        value.textContent = stat.value;
        item.append(label, value);
        return item;
      }),
    );
    runSummaryEl.classList.toggle("run-summary--win", won);
    runSummaryEl.classList.toggle("run-summary--loss", !won);
    runSummaryLobbyButton.textContent = "Back To Lobby";
    runSummaryEl.hidden = false;
    runSummaryEl.focus();
    setGameplayBlocked(true);
    syncInputControllerState();
    clearResultReturnTimer();
    resultReturnTimer = window.setTimeout(() => returnToLobbyAfterMatch(), RESULT_RETURN_DELAY_MS);
  };

  const broadcastLocalLoss = (room: MultiplayerRoom): void => {
    if (!multiplayerChannel) return;
    const user = session.getCurrentUser();
    if (!user) return;
    const payload = buildMultiplayerResultPayload(room.id, user.id, session.getCurrentUsername() ?? user.email ?? "player");
    void multiplayerChannel.send({ type: "broadcast", event: "result", payload });
  };

  const renderLocalSpectatorSnapshot = (payload: MultiplayerSnapshotPayload): void => {
    lastSpectatorLeftPayload = payload;
    spectatorPlayerNames[1] = payload.username;
    localStatus.textContent = payload.gameOver ? `${payload.username} out` : payload.username;
    localLines.textContent = String(payload.lines);
    localScore.textContent = String(payload.score);
    localCombo.textContent = "0";
    drawHoldPiece(localHoldCanvas, payload.hold);
    drawNextPieces(localNextCanvas, payload.next);
    setGarbageMeter(garbageMeter, garbageValue, payload.incomingGarbage);
    spectatorLocalRenderer.sync(payload, canvas);
    spectatorLocalRenderer.draw(payload);
  };

  const renderRemotePanelSnapshot = (payload: MultiplayerSnapshotPayload): void => {
    lastOpponentPayload = payload;
    if (playRole === "spectator" && payload.slot === 2) spectatorPlayerNames[2] = payload.username;
    opponentLastSeenMs = performance.now();
    opponentStatus.textContent = payload.gameOver ? `${payload.username} out` : payload.username;
    opponentLines.textContent = String(payload.lines);
    opponentScore.textContent = String(payload.score);
    opponentGarbage.textContent = String(payload.incomingGarbage);
    setGarbageMeter(opponentGarbageMeter, opponentGarbageValue, payload.incomingGarbage);
    opponentHold.replaceChildren(renderOpponentHold(payload.hold));
    opponentNext.replaceChildren(renderOpponentNext(payload.next));
    opponentRenderer.sync(payload, canvas);
    opponentRenderer.draw(payload);
  };

  const showSpectatorResult = (loserUserId: string, loserUsername: string): void => {
    if (matchCompleted) return;
    matchCompleted = true;
    clearCountdown();
    const left = lastSpectatorLeftPayload;
    const right = lastSpectatorRightPayload;
    const loser =
      left?.userId === loserUserId ? left : right?.userId === loserUserId ? right : null;
    const winner = loser?.slot === 1 ? right : loser?.slot === 2 ? left : null;
    const fallbackWinnerSlot = left?.userId === loserUserId ? 2 : right?.userId === loserUserId ? 1 : null;
    const winnerName = winner?.username ?? (fallbackWinnerSlot ? spectatorPlayerNames[fallbackWinnerSlot] : "Winner");
    const loserName = loser?.username ?? loserUsername;

    runSummarySubhead.textContent = "Versus / Spectating";
    runSummaryHeadline.textContent = `${winnerName} Wins`;
    runSummaryPrimaryLabel.textContent = "Knocked Out";
    runSummaryPrimaryValue.textContent = loserName;
    runSummaryStats.replaceChildren(
      ...[
        { label: "P1 Lines", value: String(left?.lines ?? 0) },
        { label: "P1 Score", value: String(left?.score ?? 0) },
        { label: "P2 Lines", value: String(right?.lines ?? 0) },
        { label: "P2 Score", value: String(right?.score ?? 0) },
      ].map((stat) => {
        const item = document.createElement("div");
        const label = document.createElement("dt");
        const value = document.createElement("dd");
        label.textContent = stat.label;
        value.textContent = stat.value;
        item.append(label, value);
        return item;
      }),
    );
    runSummaryEl.classList.add("run-summary--win");
    runSummaryEl.classList.remove("run-summary--loss");
    runSummaryLobbyButton.textContent = "Back To Lobby";
    runSummaryEl.hidden = false;
    runSummaryEl.focus();
    setGameplayBlocked(true);
    syncInputControllerState();
    clearResultReturnTimer();
    resultReturnTimer = window.setTimeout(() => returnToLobbyAfterMatch(), RESULT_RETURN_DELAY_MS);
  };

  const renderOpponentSnapshot = (payload: MultiplayerSnapshotPayload): void => {
    renderRemotePanelSnapshot(payload);
    if (payload.gameOver) showMatchResult(true);
  };

  const renderSpectatorSnapshot = (payload: MultiplayerSnapshotPayload): void => {
    if (payload.slot === 1) {
      renderLocalSpectatorSnapshot(payload);
    } else {
      lastSpectatorRightPayload = payload;
      renderRemotePanelSnapshot(payload);
    }
    if (payload.gameOver) showSpectatorResult(payload.userId, payload.username);
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
    attackDeduper.reset();
    clearResultReturnTimer();
    if (playRole === "spectator") spectatorLocalRenderer.reset();
    resetOpponentPanel();
  };

  const setupMultiplayerChannel = (roomId: string): void => {
    if (!supabase) return;
    teardownMultiplayerChannel();
    multiplayerChannel = supabase
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "snapshot" }, ({ payload }) => {
        if (!isMultiplayerSnapshotPayload(payload, roomId)) return;
        const currentUser = session.getCurrentUser();
        if (playRole === "spectator") {
          renderSpectatorSnapshot(payload);
          return;
        }
        if (payload.userId === currentUser?.id) return;
        renderOpponentSnapshot(payload);
      })
      .on("broadcast", { event: "attack" }, ({ payload }) => {
        if (playRole !== "player") return;
        const currentUser = session.getCurrentUser();
        applyRemoteGarbageAttack(payload, roomId, currentUser?.id, attackDeduper, (amount) => {
          getGame()?.enqueueGarbage(amount);
        });
      })
      .on("broadcast", { event: "result" }, ({ payload }) => {
        if (!isMultiplayerResultPayload(payload, roomId)) return;
        if (playRole === "spectator") {
          showSpectatorResult(payload.loserUserId, payload.loserUsername);
          return;
        }
        const currentUser = session.getCurrentUser();
        if (payload.loserUserId === currentUser?.id) {
          showMatchResult(false);
          return;
        }
        showMatchResult(true);
      })
      .subscribe();
  };

  const broadcastPendingGarbageAttacks = (room: MultiplayerRoom, game: Game): void => {
    if (!multiplayerChannel) return;
    const user = session.getCurrentUser();
    if (!user) return;
    for (const event of game.consumeGarbageAttackEvents()) {
      attackSequence += 1;
      const payload = buildMultiplayerAttackPayload(room.id, user.id, attackSequence, event.amount);
      void multiplayerChannel.send({ type: "broadcast", event: "attack", payload });
    }
  };

  const startMultiplayerGame = (room: MultiplayerRoom, members: RoomMember[], serverNowMs?: number): void => {
    activeRoom = room;
    playRole = "player";
    const user = session.getCurrentUser();
    const self = user ? members.find((member) => member.userId === user.id) : null;
    playerSlot = self?.role === "player" && self.slot ? self.slot : 1;
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
    attackSequence = 0;
    matchCompleted = false;
    lastSpectatorLeftPayload = null;
    lastSpectatorRightPayload = null;
    clearResultReturnTimer();
    setGarbageMeter(garbageMeter, garbageValue, 0);
    setGarbageMeter(opponentGarbageMeter, opponentGarbageValue, 0);
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

  const startSpectatingMatch = (room: MultiplayerRoom, members: RoomMember[]): void => {
    activeRoom = room;
    playRole = "spectator";
    playerSlot = null;
    setGame(null);
    runDurationMs = 0;
    completedRunShown = true;
    attackSequence = 0;
    matchCompleted = false;
    clearResultReturnTimer();
    hideRunSummary();
    resetSpectatorPanels();
    const playerOne = members.find((member) => member.role === "player" && member.slot === 1);
    const playerTwo = members.find((member) => member.role === "player" && member.slot === 2);
    spectatorPlayerNames = { 1: playerOne?.username ?? "Player 1", 2: playerTwo?.username ?? "Player 2" };
    localStatus.textContent = spectatorPlayerNames[1];
    opponentStatus.textContent = spectatorPlayerNames[2];
    gameTitle.textContent = `Spectating / ${MODE_LABELS.versus}`;
    navigate("multiplayer-playing");
    clearCountdown();
    setGameplayBlocked(true);
    syncInputControllerState();
    setupMultiplayerChannel(room.id);
    resetLastFrameTime();
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
    clearResultReturnTimer();
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
    if (getAppScreen() === "multiplayer-playing" && game && !matchCompleted) {
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
    broadcastPendingGarbageAttacks(room, game);
    renderer.draw(game, false);
    hudUpdater.update(snap);
    setGarbageMeter(garbageMeter, garbageValue, snap.incomingGarbage);

    if (multiplayerChannel) {
      const now = performance.now();
      if (now - lastSnapshotBroadcastMs >= SNAPSHOT_BROADCAST_INTERVAL_MS) {
        lastSnapshotBroadcastMs = now;
        const user = session.getCurrentUser();
        if (user) {
          const payload = buildMultiplayerSnapshot(
            room.id,
            user.id,
            session.getCurrentUsername() ?? user.email ?? "player",
            playerSlot ?? 1,
            snap,
          );
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
      broadcastLocalLoss(room);
      showMatchResult(false);
    }
  };

  const onResize = (): void => {
    if (playRole === "spectator") {
      if (lastSpectatorLeftPayload) {
        spectatorLocalRenderer.sync(lastSpectatorLeftPayload, canvas);
        spectatorLocalRenderer.draw(lastSpectatorLeftPayload);
      }
      if (lastSpectatorRightPayload) {
        opponentRenderer.sync(lastSpectatorRightPayload, canvas);
        opponentRenderer.draw(lastSpectatorRightPayload);
      }
      return;
    }
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
    startSpectatingMatch,
    setTipsOpen,
    stepFrame,
    drawFrame,
    onResize,
  };
};

export { initMultiplayerPlayingScreen };
export type { MultiplayerPlayingScreen };
