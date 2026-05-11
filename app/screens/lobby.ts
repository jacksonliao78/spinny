import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppScreen } from "../constants";
import {
  canStartRoom,
  fetchRoom,
  getServerTime,
  getPlayerMembers,
  getSpectatorMembers,
  leaveRoom,
  setReady,
  startRoom,
  touchRoomMember,
  type RoomMember,
  type RoomWithMembers,
} from "../multiplayer/rooms";
import type { SessionController } from "../session";

type LobbyScreenOptions = {
  lobbyLeaveButton: HTMLButtonElement;
  lobbyRefreshButton: HTMLButtonElement;
  lobbyReadyButton: HTMLButtonElement;
  lobbyStartButton: HTMLButtonElement;
  lobbyWatchButton: HTMLButtonElement;
  lobbyStatus: HTMLElement;
  lobbyContent: HTMLElement;
  lobbyHeading: HTMLElement;
  lobbyCode: HTMLElement;
  lobbyVisibility: HTMLElement;
  lobbyRoomStatus: HTMLElement;
  lobbyMembers: HTMLElement;
  lobbySpectators: HTMLElement;
  supabase: SupabaseClient | null;
  session: SessionController;
  navigate: (screen: AppScreen) => void;
  getCurrentRoomId: () => string | null;
  setCurrentRoomId: (roomId: string | null) => void;
  startMultiplayerGame: (room: RoomWithMembers["room"], members: RoomMember[], serverNowMs?: number) => void;
  startSpectatingMatch: (room: RoomWithMembers["room"], members: RoomMember[]) => void;
  canAutoStartRoom: () => boolean;
};

type LobbyScreen = {
  enter: () => void;
  leave: () => void;
};

const statusLabel = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const createSeed = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const renderMember = (member: RoomMember | null, slot: 1 | 2, hostUserId: string): HTMLElement => {
  const item = document.createElement("div");
  item.className = "lobby-member";

  const name = document.createElement("strong");
  const detail = document.createElement("span");
  if (member) {
    name.textContent = member.username;
    detail.textContent = `${member.userId === hostUserId ? "Host" : `Player ${slot}`} / ${member.ready ? "Ready" : "Not ready"}`;
    if (member.ready) item.dataset.ready = "true";
  } else {
    name.textContent = `Slot ${slot}`;
    detail.textContent = "Open";
  }

  item.append(name, detail);
  return item;
};

const initLobbyScreen = ({
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
  getCurrentRoomId,
  setCurrentRoomId,
  startMultiplayerGame,
  startSpectatingMatch,
  canAutoStartRoom,
}: LobbyScreenOptions): LobbyScreen => {
  let currentRoom: RoomWithMembers | null = null;
  let loadEpoch = 0;
  let pollTimer: number | null = null;
  let loadInFlight = false;

  const setStatus = (message: string, kind = ""): void => {
    lobbyStatus.textContent = message;
    lobbyStatus.dataset.kind = kind;
  };

  const setButtonsBusy = (busy: boolean): void => {
    lobbyLeaveButton.disabled = busy;
    lobbyRefreshButton.disabled = busy;
    lobbyReadyButton.disabled = busy;
    lobbyStartButton.disabled = busy;
    lobbyWatchButton.disabled = busy;
  };

  const renderSpectators = (spectators: RoomMember[]): void => {
    lobbySpectators.hidden = spectators.length === 0;
    if (spectators.length === 0) {
      lobbySpectators.replaceChildren();
      return;
    }
    const label = document.createElement("strong");
    label.textContent = `Spectators (${spectators.length})`;
    const names = document.createElement("span");
    names.textContent = spectators.map((member) => member.username).join(", ");
    lobbySpectators.replaceChildren(label, names);
  };

  const render = (room: RoomWithMembers): void => {
    const user = session.getCurrentUser();
    const self = user ? room.members.find((member) => member.userId === user.id) ?? null : null;
    const host = user?.id === room.room.hostUserId;
    const player = self?.role === "player";
    const players = getPlayerMembers(room.members);
    const spectators = getSpectatorMembers(room.members);
    const slotOne = players.find((member) => member.slot === 1) ?? null;
    const slotTwo = players.find((member) => member.slot === 2) ?? null;

    lobbyHeading.textContent = room.room.status === "lobby" ? "Waiting" : statusLabel(room.room.status);
    lobbyCode.textContent = room.room.joinCode;
    lobbyVisibility.textContent = statusLabel(room.room.visibility);
    lobbyRoomStatus.textContent = statusLabel(room.room.status);
    lobbyMembers.replaceChildren(renderMember(slotOne, 1, room.room.hostUserId), renderMember(slotTwo, 2, room.room.hostUserId));
    renderSpectators(spectators);

    lobbyReadyButton.textContent = self?.ready ? "Unready" : "Ready";
    lobbyReadyButton.hidden = room.room.status !== "lobby" || !self || !player;
    lobbyReadyButton.disabled = false;
    lobbyStartButton.hidden = !host || !player;
    lobbyStartButton.disabled = room.room.status !== "lobby" || !canStartRoom(room.room, room.members);
    lobbyWatchButton.hidden = !self || player || !shouldStartLocalGame(room);
    lobbyWatchButton.disabled = false;
    lobbyRefreshButton.disabled = false;
    lobbyContent.hidden = false;
  };

  const shouldStartLocalGame = (room: RoomWithMembers): boolean =>
    (room.room.status === "countdown" || room.room.status === "playing") &&
    Boolean(room.room.seed) &&
    Boolean(room.room.countdownStartsAt);

  const startLocalGameFromRoom = async (room: RoomWithMembers, epoch: number): Promise<void> => {
    const serverTime = supabase ? Date.parse(await getServerTime(supabase)) : NaN;
    if (epoch !== loadEpoch || getCurrentRoomId() !== room.room.id) return;
    startMultiplayerGame(room.room, room.members, Number.isFinite(serverTime) ? serverTime : undefined);
  };

  const loadRoom = async (silent = false): Promise<void> => {
    if (loadInFlight) return;
    const roomId = getCurrentRoomId();
    const user = session.getCurrentUser();
    if (!roomId || !user || session.isGuestMode()) {
      currentRoom = null;
      lobbyContent.hidden = true;
      setStatus("Sign in and join a room first.", "empty");
      return;
    }
    if (!supabase) {
      currentRoom = null;
      lobbyContent.hidden = true;
      setStatus("Rooms are unavailable because account services are not configured.", "error");
      return;
    }

    const myEpoch = ++loadEpoch;
    loadInFlight = true;
    if (!silent) setStatus("Loading lobby...", "");
    lobbyRefreshButton.disabled = true;
    try {
      await touchRoomMember(supabase, roomId, user.id);
      const room = await fetchRoom(supabase, roomId);
      if (myEpoch !== loadEpoch) return;
      currentRoom = room;
      render(room);
      const self = room.members.find((member) => member.userId === user.id);
      if (self?.role === "player" && shouldStartLocalGame(room) && canAutoStartRoom()) {
        await startLocalGameFromRoom(room, myEpoch);
        return;
      }
      setStatus("", "");
    } catch (error) {
      if (myEpoch !== loadEpoch) return;
      currentRoom = null;
      lobbyContent.hidden = true;
      setStatus(error instanceof Error ? error.message : "Could not load lobby.", "error");
    } finally {
      loadInFlight = false;
      if (myEpoch === loadEpoch) lobbyRefreshButton.disabled = false;
    }
  };

  const leaveCurrentRoom = async (): Promise<void> => {
    const roomId = getCurrentRoomId();
    if (!roomId || !supabase) {
      setCurrentRoomId(null);
      navigate("multiplayer");
      return;
    }
    setButtonsBusy(true);
    loadEpoch += 1;
    setStatus("Leaving room...", "");
    try {
      await leaveRoom(supabase, roomId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not leave room.", "error");
      setButtonsBusy(false);
      return;
    }
    setCurrentRoomId(null);
    currentRoom = null;
    setButtonsBusy(false);
    navigate("multiplayer");
  };

  const toggleReady = async (): Promise<void> => {
    const room = currentRoom;
    const user = session.getCurrentUser();
    if (!room || !user || !supabase) return;
    const self = room.members.find((member) => member.userId === user.id);
    if (!self || self.role !== "player") return;
    setButtonsBusy(true);
    setStatus(self.ready ? "Updating..." : "Ready...", "");
    try {
      await setReady(supabase, room.room.id, user.id, !self.ready);
      await loadRoom(true);
      setStatus("", "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update ready state.", "error");
    } finally {
      setButtonsBusy(false);
      if (currentRoom) render(currentRoom);
    }
  };

  const startCurrentRoom = async (): Promise<void> => {
    const room = currentRoom;
    if (!room || !supabase) return;
    setButtonsBusy(true);
    setStatus("Starting room...", "");
    try {
      const started = await startRoom(supabase, room.room.id, room.room.settings, createSeed(), 3_000);
      currentRoom = { ...room, room: started };
      render(currentRoom);
      await startLocalGameFromRoom(currentRoom, loadEpoch);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start room.", "error");
    } finally {
      setButtonsBusy(false);
      if (currentRoom) render(currentRoom);
    }
  };

  const watchCurrentMatch = (): void => {
    const room = currentRoom;
    if (!room || !shouldStartLocalGame(room)) return;
    startSpectatingMatch(room.room, room.members);
  };

  const enter = (): void => {
    setStatus("", "");
    lobbyContent.hidden = true;
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => void loadRoom(true), 1_000);
    void loadRoom();
  };

  const leave = (): void => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    loadEpoch += 1;
  };

  lobbyLeaveButton.addEventListener("click", () => void leaveCurrentRoom());
  lobbyRefreshButton.addEventListener("click", () => void loadRoom());
  lobbyReadyButton.addEventListener("click", () => void toggleReady());
  lobbyStartButton.addEventListener("click", () => void startCurrentRoom());
  lobbyWatchButton.addEventListener("click", () => watchCurrentMatch());

  return { enter, leave };
};

export { initLobbyScreen };
export type { LobbyScreen };
