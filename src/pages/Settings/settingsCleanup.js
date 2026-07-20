export async function performSettingsCleanup(
  action,
  { clearMapCache, clearDatabase },
) {
  if (action === "clearMapCache") {
    await clearMapCache();
    return action;
  }

  if (action === "clearDatabase" && typeof clearDatabase === "function") {
    await clearDatabase();
    return action;
  }

  return null;
}
