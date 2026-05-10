import type { BoardKind } from "@game/board/factory";
import type { SupabaseClient } from "@supabase/supabase-js";

type RoomVisibility = "public" | "private";
type RoomStatus = "lobby" | "countdown" | "playing" | "finished" | "abandoned";

type MultiplayerRoomSettings = {
  boardKind: BoardKind;
};

type MultiplayerRoom = {
  id: string;
  joinCode: string;
  visibility: RoomVisibility;
  status: RoomStatus;
  hostUserId: string;
  maxPlayers: number;
  settings: MultiplayerRoomSettings;
  seed: string | null;
  countdownStartsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RoomMember = {
  roomId: string;
  userId: string;
  username: string;
  slot: 1 | 2;
  ready: boolean;
  connected: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

type RoomWithMembers = {
  room: MultiplayerRoom;
  members: RoomMember[];
};

type CreateRoomInput = {
  userId: string;
  username: string;
  visibility: RoomVisibility;
  settings?: Partial<MultiplayerRoomSettings>;
};

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_ROOM_SETTINGS: MultiplayerRoomSettings = {
  boardKind: "rectangular",
};

const normalizeJoinCode = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const createJoinCode = (random: () => number = Math.random): string => {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.max(0, Math.min(0.999999999999, random())) * JOIN_CODE_ALPHABET.length);
    code += JOIN_CODE_ALPHABET[index];
  }
  return code;
};

const sanitizeUsername = (username: string): string => {
  const trimmed = username.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 64) : "player";
};

const buildRoomSettings = (settings: Partial<MultiplayerRoomSettings> = {}): MultiplayerRoomSettings => ({
  ...DEFAULT_ROOM_SETTINGS,
  ...settings,
});

const isDuplicateMembershipError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  if (maybeError.code !== "23505") return false;
  const text = `${String(maybeError.message ?? "")} ${String(maybeError.details ?? "")}`.toLowerCase();
  return text.includes("room_members_pkey") || text.includes("(room_id, user_id)");
};

const roomFromRow = (row: any): MultiplayerRoom => ({
  id: String(row.id),
  joinCode: String(row.join_code),
  visibility: row.visibility === "public" ? "public" : "private",
  status: row.status as RoomStatus,
  hostUserId: String(row.host_user_id),
  maxPlayers: Number(row.max_players),
  settings: buildRoomSettings(row.settings ?? {}),
  seed: typeof row.seed === "string" ? row.seed : null,
  countdownStartsAt: typeof row.countdown_starts_at === "string" ? row.countdown_starts_at : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const memberFromRow = (row: any): RoomMember => ({
  roomId: String(row.room_id),
  userId: String(row.user_id),
  username: String(row.username),
  slot: Number(row.slot) === 2 ? 2 : 1,
  ready: Boolean(row.ready),
  connected: Boolean(row.connected),
  joinedAt: String(row.joined_at),
  lastSeenAt: String(row.last_seen_at),
});

const fetchRoomMembers = async (supabase: SupabaseClient, roomId: string): Promise<RoomMember[]> => {
  const { data, error } = await supabase
    .from("room_members")
    .select("*")
    .eq("room_id", roomId)
    .order("slot", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(memberFromRow);
};

const fetchRoom = async (supabase: SupabaseClient, roomId: string): Promise<RoomWithMembers> => {
  const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  if (error) throw error;
  return {
    room: roomFromRow(data),
    members: await fetchRoomMembers(supabase, roomId),
  };
};

const createRoom = async (
  supabase: SupabaseClient,
  { userId, username, visibility, settings }: CreateRoomInput,
): Promise<RoomWithMembers> => {
  const memberName = sanitizeUsername(username);
  const roomSettings = buildRoomSettings(settings);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const joinCode = createJoinCode();
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .insert({
        join_code: joinCode,
        visibility,
        host_user_id: userId,
        settings: roomSettings,
      })
      .select("*")
      .single();

    if (roomError) {
      if ((roomError as any).code === "23505" && attempt < 2) continue;
      throw roomError;
    }

    const room = roomFromRow(roomData);
    const { error: memberError } = await supabase.from("room_members").insert({
      room_id: room.id,
      user_id: userId,
      username: memberName,
      slot: 1,
    });

    if (memberError) {
      await supabase.from("rooms").delete().eq("id", room.id);
      throw memberError;
    }

    return {
      room,
      members: await fetchRoomMembers(supabase, room.id),
    };
  }

  throw new Error("Could not create a unique room code.");
};

const listPublicRooms = async (supabase: SupabaseClient): Promise<MultiplayerRoom[]> => {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("visibility", "public")
    .eq("status", "lobby")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(roomFromRow);
};

const joinPublicRoom = async (
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
  username: string,
): Promise<RoomWithMembers> => {
  const { error } = await supabase.from("room_members").insert({
    room_id: roomId,
    user_id: userId,
    username: sanitizeUsername(username),
    slot: 2,
  });
  if (error && !isDuplicateMembershipError(error)) throw error;
  return fetchRoom(supabase, roomId);
};

const joinPrivateRoomByCode = async (
  supabase: SupabaseClient,
  joinCode: string,
  username: string,
): Promise<RoomWithMembers> => {
  const { data, error } = await supabase.rpc("join_private_room_by_code", {
    target_join_code: normalizeJoinCode(joinCode),
    member_username: sanitizeUsername(username),
    requested_slot: 2,
  });
  if (error) throw error;
  return fetchRoom(supabase, String(data));
};

const leaveRoom = async (supabase: SupabaseClient, roomId: string, userId: string): Promise<void> => {
  const { error } = await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
  if (error) throw error;
};

const setReady = async (supabase: SupabaseClient, roomId: string, userId: string, ready: boolean): Promise<void> => {
  const { error } = await supabase
    .from("room_members")
    .update({ ready, connected: true, last_seen_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw error;
};

const touchRoomMember = async (supabase: SupabaseClient, roomId: string, userId: string): Promise<void> => {
  const { error } = await supabase
    .from("room_members")
    .update({ connected: true, last_seen_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw error;
};

const startRoom = async (
  supabase: SupabaseClient,
  roomId: string,
  settings: MultiplayerRoomSettings,
  seed: string,
  countdownStartsAt: string,
): Promise<MultiplayerRoom> => {
  const { data, error } = await supabase
    .from("rooms")
    .update({
      status: "countdown",
      settings,
      seed,
      countdown_starts_at: countdownStartsAt,
    })
    .eq("id", roomId)
    .select("*")
    .single();
  if (error) throw error;
  return roomFromRow(data);
};

export {
  DEFAULT_ROOM_SETTINGS,
  buildRoomSettings,
  createJoinCode,
  createRoom,
  fetchRoom,
  joinPrivateRoomByCode,
  joinPublicRoom,
  leaveRoom,
  listPublicRooms,
  normalizeJoinCode,
  setReady,
  startRoom,
  touchRoomMember,
};
export type { MultiplayerRoom, MultiplayerRoomSettings, RoomMember, RoomStatus, RoomVisibility, RoomWithMembers };
