import { ComponentRepository } from "@/repositories/ComponentRepository";
import { mergeComponentRegistries } from "@/domain/componentMerge";
import { logger } from "@/utils/logger";
import {
  buildComponentPhotoArchive,
  restoreComponentPhotos,
} from "./componentPhotoArchive";
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
 * Comes with the photographs: `photoEntries` are zip entries the caller adds
 * beside the JSON, and the JSON's own photo paths already point at them. The
 * two are returned together because they are only correct together — writing
 * the JSON without the pictures is exactly the silent loss this replaced.
 *
 * @param {object} project
 * @param {{load?: (project: object) => Promise<object[]>, idbGet?: (id: string) => Promise<any>, photoDir?: string}} [options]
 */
export async function buildComponentArchiveEntry(project, options = {}) {
  if (!project?.id) return null;

  const {
    load = (target) => ComponentRepository.load(target),
    idbGet,
    photoDir,
  } = typeof options === "function" ? { load: options } : options;

  try {
    const stored = await load(project);
    if (!stored?.length) return null;

    const { components, entries, paths } = await buildComponentPhotoArchive(
      stored,
      idbGet,
      photoDir ? { dir: photoDir } : {},
    );

    return {
      path: COMPONENT_ARCHIVE_FILE,
      photoEntries: entries,
      // Куда лист должен ссылаться из колонки «Фото», по id карточки.
      photoPaths: paths,
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
    // Before the merge, not after: the merge decides which card wins, and a
    // card that won with a path into another device's storage would show an
    // empty frame where a photograph is.
    incoming = await restoreComponentPhotos(zip, incoming, project);
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
