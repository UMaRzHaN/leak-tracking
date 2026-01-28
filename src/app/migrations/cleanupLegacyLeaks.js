export function cleanupLegacyLeaks() {
  const keys = Object.keys(localStorage);

  for (const key of keys) {
    if (!key.startsWith("leaks_database:")) continue;

    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (
        Array.isArray(data) &&
        data.some((item) => item.photo?.startsWith("data:image"))
      ) {
        keys.forEach((k) => {
          if (k.startsWith("leaks_database:")) {
            localStorage.removeItem(k);
          }
        });
        return true; // было очищено
      }
    } catch {
      /* ignore */
    }
  }

  return false;
}
