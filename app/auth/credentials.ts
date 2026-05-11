import { USERNAME_PATTERN } from "../constants";
import { normalizeUsername } from "./username";

const INTERNAL_AUTH_EMAIL_DOMAIN = "users.spinny.invalid";

const authEmailForUsername = (value: string): string => {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Invalid username");
  }
  return `${username}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
};

const usernameFromAuthEmail = (email: string | undefined): string | null => {
  if (!email) return null;
  const suffix = `@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
  if (!email.endsWith(suffix)) return null;
  const username = email.slice(0, -suffix.length);
  return USERNAME_PATTERN.test(username) ? username : null;
};

export { authEmailForUsername, usernameFromAuthEmail };
