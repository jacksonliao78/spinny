import { PENDING_SIGNUP_USERNAME_KEY } from "../constants";

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

export { clearPendingSignupUsername, loadPendingSignupUsername, normalizeUsername, savePendingSignupUsername };
