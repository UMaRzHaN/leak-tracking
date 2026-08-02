export function requireHistoryUser(user) {
  const normalized = typeof user === "string" ? user.trim() : "";
  if (normalized) return normalized;

  const error = new Error("History user is required");
  error.code = "HISTORY_USER_REQUIRED";
  throw error;
}
