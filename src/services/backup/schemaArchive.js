import {
  allocateSchemaFileName,
  createSchemaEntry,
  isSupportedSchema,
} from "@/domain/technologicalSchemas";
import { SchemaRepository } from "@/repositories/SchemaRepository";
import { logger } from "@/utils/logger";
import { getJSZip } from "./runtime";

/**
 * Technological schemas travelling in and out of a project archive.
 *
 * They ride alongside `photos/` in a folder of their own, under the names the
 * drawings actually have — the archive is opened by people, and
 * "Схема обвязки устья.pdf" is what they are looking for.
 *
 * The restore path is a second, separate pass over the same zip rather than an
 * addition to the leak-import pipeline. That pipeline hands photos back through
 * a worker proxy, and threading a new payload type through it would cost far
 * more than re-reading a few drawings. If a project ever ships hundreds of
 * schemas, this is the first place to revisit.
 */

export const SCHEMA_ARCHIVE_DIR = "technological_schemas";

/**
 * Zip entries for a project's drawings.
 *
 * A drawing whose bytes have gone missing is skipped with a warning rather
 * than failing the export: the point of the archive is the data, and losing a
 * whole export over one absent file would be a poor trade.
 *
 * @param {object} project
 * @param {object[]} schemas index entries
 * @param {(project: object, schema: object) => Promise<Blob|null>} readSchemaFile
 * @returns {Promise<{path: string, blob: Blob, name: string}[]>}
 */
export async function buildSchemaArchiveEntries(
  project,
  schemas,
  readSchemaFile,
) {
  const used = new Set();
  const entries = [];

  for (const schema of schemas ?? []) {
    let blob = null;
    try {
      blob = await readSchemaFile(project, schema);
    } catch (error) {
      logger.warn("[schemas] skipped an unreadable drawing on export:", error);
    }
    if (!blob) continue;

    const name = allocateSchemaFileName(schema.name, used);
    used.add(name);
    entries.push({ path: `${SCHEMA_ARCHIVE_DIR}/${name}`, blob, name });
  }

  return entries;
}

/**
 * Reads the drawings out of an archive into a project's schema storage.
 *
 * Called after the project itself is created. Without it a project moved to
 * another device would arrive with every leak and component intact and no
 * drawings at all — a loss nobody notices until somebody opens the section in
 * the field.
 *
 * @param {File|Blob} file the archive
 * @param {object} project the freshly created project
 * @returns {Promise<{restored: number, skipped: number}>}
 */
export async function restoreSchemasFromArchive(file, project) {
  if (!project?.id) return { restored: 0, skipped: 0 };

  let zip;
  try {
    const JSZip = (await getJSZip()).default;
    zip = await new JSZip().loadAsync(file);
  } catch (error) {
    logger.warn("[schemas] could not reopen the archive for drawings:", error);
    return { restored: 0, skipped: 0 };
  }

  const folder = zip.folder(SCHEMA_ARCHIVE_DIR);
  if (!folder) return { restored: 0, skipped: 0 };

  const files = [];
  folder.forEach((relativePath, entry) => {
    if (!entry.dir) files.push({ relativePath, entry });
  });

  let restored = 0;
  let skipped = 0;

  for (const { relativePath, entry } of files) {
    try {
      const blob = await entry.async("blob");
      const schema = createSchemaEntry({
        name: relativePath,
        // A zip carries no media type, so the name is all there is to go on —
        // createSchemaEntry falls back to the extension for exactly this.
        type: "",
        size: blob.size,
      });

      if (!isSupportedSchema(schema)) {
        skipped += 1;
        continue;
      }

      await SchemaRepository.addSchema(project, schema, blob);
      restored += 1;
    } catch (error) {
      logger.warn(`[schemas] could not restore "${relativePath}":`, error);
      skipped += 1;
    }
  }

  return { restored, skipped };
}
