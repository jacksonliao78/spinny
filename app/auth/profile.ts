import type { SupabaseClient, User } from "@supabase/supabase-js";
import { USERNAME_PATTERN } from "../constants";
import { loadPendingSignupUsername, normalizeUsername } from "./username";

const loadProfileUsername = async (supabase: SupabaseClient, userId: string): Promise<string | null> => {
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

const saveProfileUsername = async (supabase: SupabaseClient, userId: string, username: string): Promise<void> => {
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, username }, { onConflict: "user_id" });
  if (error) throw error;
};

export { getSignupUsernameCandidate, loadProfileUsername, saveProfileUsername };
