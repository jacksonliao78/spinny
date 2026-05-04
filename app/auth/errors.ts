const readableAuthError = (error: unknown): string => {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";
    if (code === "23505" || /duplicate|unique/i.test(message)) return "That username is already taken.";
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
};

const isUsernameTakenError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "23505" || /duplicate|unique/i.test(message);
};

export { isUsernameTakenError, readableAuthError };
