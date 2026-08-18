import { ComponentRepository } from "@/repositories/ComponentRepository";
import { mergeComponentRegistries } from "@/domain/componentMerge";
import { logger } from "@/utils/logger";
import { getJSZip } from "./runtime";

/**
 * The component registry travelling in a project archive.
 *
 * Plain JSON at the archive root, beside the workbook: the registry is the
 * inventory of a whole field and has to survive being carried between devices
 * on a memory stick, which is how these archives actually move.
 *
 * Restoring *merges* rather than replaces. An archive is usually a colleague's
 * half of the same walk, and overwriting would throw away whichever half
 * happened to arrive second.
 */

export const COMPONENT_ARCHIVE_FILE = "components.json";
const ARCHIVE_VERSION = 1;

/**
 * The archive entry for a project's registry, or null when there is nothing
 * to carry.
 *
 * @param {object} project
 * @param {(project: object) => Promise<object[]>} [load]
 */
export async function buildComponentArchiveEntry(
  project,
  load = (target) => ComponentRepository.load(target),
) {
  if (!project?.id) return null;

  try {
    const components = await load(project);
    if (!components?.length) return null;

    return {
      path: COMPONENT_ARCHIVE_FILE,
      content: JSON.stringify({
        version: ARCHIVE_VERSION,
        exportedAt: Date.now(),
        data: components,
      }),
    };
  } catch (error) {
    // The leaks are the bulk of what an export is for; losing the registry
    // from one archive is recoverable, failing the export is not.
    logger.warn("[components] registry left out of the archive:", error);
    return null;
  }
}

function unwrap(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

/**
 * Merges an archive's registry into a project's own.
 *
 * Conflicting identity numbers are reported, never resolved here: the app
 * hands out no number ranges and cannot see another device's cards, so two
 * walkers colliding on a number is expected. Both cards survive and a human
 * decides which gets renumbered.
 *
 * @param {File|Blob} file the archive
 * @param {object} project
 * @returns {Promise<{added: number, updated: number, conflicts: number}>}
 */
export async function restoreComponentsFromArchive(file, project) {
  const nothing = { added: 0, updated: 0, conflicts: 0 };
  if (!project?.id) return nothing;

  let incoming;
  try {
    const JSZip = (await getJSZip()).default;
    const zip = await new JSZip().loadAsync(file);
    const entry = zip.file(COMPONENT_ARCHIVE_FILE);
    if (!entry) return nothing;

    incoming = unwrap(JSON.parse(await entry.async("string")));
  } catch (error) {
    logger.warn(
      "[components] could not read the registry from the archive:",
      error,
    );
    return nothing;
  }

  if (incoming.length === 0) return nothing;

  try {
    const local = await ComponentRepository.load(project);
    const { merged, added, updated, conflicts } = mergeComponentRegistries(
      local,
      incoming,
    );

    await ComponentRepository.save(project, merged);
    return { added, updated, conflicts: conflicts.length };
  } catch (error) {
    logger.warn("[components] could not merge the incoming registry:", error);
    return nothing;
  }
}
