import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppScreen } from "../constants";
import {
  createRoom,
  joinPrivateRoomByCode,
  joinPublicRoom,
  listPublicRooms,
  type MultiplayerRoom,
  type RoomVisibility,
} from "../multiplayer/rooms";
import type { SessionController } from "../session";

type MultiplayerScreenOptions = {
  multiplayerBackButton: HTMLButtonElement;
  multiplayerSignInButton: HTMLButtonElement;
  createPublicRoomButton: HTMLButtonElement;
  createPrivateRoomButton: HTMLButtonElement;
  joinCodeInput: HTMLInputElement;
  joinCodeButton: HTMLButtonElement;
  refreshRoomsButton: HTMLButtonElement;
  multiplayerStatus: HTMLElement;
  multiplayerContent: HTMLElement;
  publicRoomsList: HTMLElement;
  supabase: SupabaseClient | null;
  session: SessionController;
  navigate: (screen: AppScreen) => void;
  openAuthLogin: () => void;
  setCurrentRoomId: (roomId: string | null) => void;
};

type MultiplayerScreen = {
  enter: () => void;
};

const currentUsername = (session: SessionController): string =>
  session.getCurrentUsername() ?? session.getCurrentUser()?.email ?? "player";

const setButtonBusy = (buttons: HTMLButtonElement[], busy: boolean): void => {
  buttons.forEach((button) => {
    button.disabled = busy;
  });
};

const renderRoom = (room: MultiplayerRoom, onJoin: (room: MultiplayerRoom) => void): HTMLElement => {
  const item = document.createElement("article");
  item.className = "room-card";

  const meta = document.createElement("div");
  const title = document.createElement("strong");
  const details = document.createElement("span");
  title.textContent = room.joinCode;
  details.textContent = `${room.status} / ${room.settings.boardKind === "ring" ? "Spinny" : "Regular"}`;
  meta.append(title, details);

  const button = document.createElement("button");
  button.className = "secondary-button";
  button.type = "button";
  button.textContent = "Join";
  button.addEventListener("click", () => onJoin(room));

  item.append(meta, button);
  return item;
};

const initMultiplayerScreen = ({
  multiplayerBackButton,
  multiplayerSignInButton,
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
  openAuthLogin,
  setCurrentRoomId,
}: MultiplayerScreenOptions): MultiplayerScreen => {
  let loadEpoch = 0;

  const allActionButtons = [
    createPublicRoomButton,
    createPrivateRoomButton,
    joinCodeButton,
    refreshRoomsButton,
  ];

  const setStatus = (message: string, kind = ""): void => {
    multiplayerStatus.textContent = message;
    multiplayerStatus.dataset.kind = kind;
  };

  const canUseRooms = (): boolean => {
    const user = session.getCurrentUser();
    if (!user || session.isGuestMode()) {
      multiplayerContent.hidden = true;
      multiplayerSignInButton.hidden = false;
      setStatus("Sign in to create or join rooms.", "empty");
      return false;
    }
    if (!supabase) {
      multiplayerContent.hidden = true;
      multiplayerSignInButton.hidden = true;
      setStatus("Rooms are unavailable because account services are not configured.", "error");
      return false;
    }
    multiplayerContent.hidden = false;
    multiplayerSignInButton.hidden = true;
    return true;
  };

  const openRoom = (roomId: string): void => {
    setCurrentRoomId(roomId);
    navigate("lobby");
  };

  const loadPublicRooms = async (): Promise<void> => {
    if (!canUseRooms() || !supabase) return;
    const myEpoch = ++loadEpoch;
    setStatus("Loading rooms...", "");
    refreshRoomsButton.disabled = true;
    try {
      const rooms = await listPublicRooms(supabase);
      if (myEpoch !== loadEpoch) return;
      publicRoomsList.replaceChildren(
        ...(rooms.length > 0
          ? rooms.map((room) => renderRoom(room, (selected) => void joinPublic(selected)))
          : [Object.assign(document.createElement("div"), { className: "room-empty", textContent: "No public rooms waiting." })]),
      );
      setStatus("", "");
    } catch (error) {
      if (myEpoch !== loadEpoch) return;
      publicRoomsList.replaceChildren();
      setStatus(error instanceof Error ? error.message : "Could not load rooms.", "error");
    } finally {
      if (myEpoch === loadEpoch) refreshRoomsButton.disabled = false;
    }
  };

  const createNewRoom = async (visibility: RoomVisibility): Promise<void> => {
    const user = session.getCurrentUser();
    if (!canUseRooms() || !supabase || !user) return;
    setButtonBusy(allActionButtons, true);
    setStatus("Creating room...", "");
    try {
      const room = await createRoom(supabase, {
        userId: user.id,
        username: currentUsername(session),
        visibility,
      });
      openRoom(room.room.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create room.", "error");
    } finally {
      setButtonBusy(allActionButtons, false);
    }
  };

  const joinPublic = async (room: MultiplayerRoom): Promise<void> => {
    if (!canUseRooms() || !supabase) return;
    setButtonBusy(allActionButtons, true);
    setStatus("Joining room...", "");
    try {
      const joined = await joinPublicRoom(supabase, room.id, currentUsername(session));
      openRoom(joined.room.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not join room.", "error");
      await loadPublicRooms();
    } finally {
      setButtonBusy(allActionButtons, false);
    }
  };

  const joinPrivate = async (): Promise<void> => {
    if (!canUseRooms() || !supabase) return;
    const code = joinCodeInput.value;
    if (!code.trim()) {
      setStatus("Enter a room code.", "empty");
      return;
    }
    setButtonBusy(allActionButtons, true);
    setStatus("Joining room...", "");
    try {
      const room = await joinPrivateRoomByCode(supabase, code, currentUsername(session));
      openRoom(room.room.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not join room.", "error");
    } finally {
      setButtonBusy(allActionButtons, false);
    }
  };

  const enter = (): void => {
    setCurrentRoomId(null);
    setStatus("", "");
    publicRoomsList.replaceChildren();
    if (canUseRooms()) void loadPublicRooms();
  };

  multiplayerBackButton.addEventListener("click", () => navigate("landing"));
  multiplayerSignInButton.addEventListener("click", openAuthLogin);
  createPublicRoomButton.addEventListener("click", () => void createNewRoom("public"));
  createPrivateRoomButton.addEventListener("click", () => void createNewRoom("private"));
  refreshRoomsButton.addEventListener("click", () => void loadPublicRooms());
  joinCodeButton.addEventListener("click", () => void joinPrivate());
  joinCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void joinPrivate();
  });

  return { enter };
};

export { initMultiplayerScreen };
export type { MultiplayerScreen };
