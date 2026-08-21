import { logger } from "@/utils/logger";

/**
 * Реестр компонентов и чертежи, приехавшие в архиве.
 *
 * Они лежат рядом с утечками, но живут своей жизнью: у каждого своё хранилище,
 * и восстанавливаются они после того, как утечки записаны. Отсюда общее для
 * обоих правило — не ронять импорт: проект, который уже приехал целым, не
 * должен пропадать из-за того, что не свёлся реестр или не открылся чертёж.
 */
/**
 * Restores the archive's technological schemas into a freshly imported
 * project. Never throws: losing the drawings is a nuisance the operator can
 * fix by loading them again, while failing the import here would discard a
 * project that already came across correctly.
 */
export async function restoreProjectSchemas(file, project) {
  try {
    const { restoreSchemasFromArchive } =
      await import("@/services/backup/schemaArchive");
    return await restoreSchemasFromArchive(file, project);
  } catch (error) {
    logger.warn("[projectBackupService] Could not restore schemas:", error);
    return { restored: 0, skipped: 0 };
  }
}

/**
 * Merges the archive's component registry into the imported project. Like the
 * schemas, kept outside the leak rollback: an archive that carried the leaks
 * across correctly must not be discarded because the registry would not merge.
 */
export async function restoreProjectComponents(file, project) {
  try {
    const { restoreComponentsFromArchive } =
      await import("@/services/backup/componentArchive");
    return await restoreComponentsFromArchive(file, project);
  } catch (error) {
    logger.warn("[projectBackupService] Could not merge components:", error);
    return { added: 0, updated: 0, conflicts: 0 };
  }
}
