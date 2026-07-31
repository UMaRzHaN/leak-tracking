import { logger } from "@/utils/logger";

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
        logger.warn(
          `[cleanupLegacyLeaks] Legacy database "${key}" contains inline photos and was preserved to avoid data loss.`,
        );
      }
    } catch (err) {
      logger.warn(
        `[cleanupLegacyLeaks] Could not parse legacy key "${key}":`,
        err,
      );
    }
  }

  return false;
}
