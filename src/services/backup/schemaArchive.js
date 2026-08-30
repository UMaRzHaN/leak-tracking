import {
  allocateSchemaFileName,
  createSchemaEntry,
  isSupportedSchema,
} from "@/domain/technologicalSchemas";
import {
  isLiveSchema,
  liveSchemas,
  mergeSchemaLists,
  schemaIdentity,
} from "@/domain/schemaTombstones";
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
 * Список схем внутри папки с чертежами.
 *
 * Без него в архиве едут одни файлы, а по имени файла не восстановить ни
 * времени добавления, ни того, что схему удалили. Отсюда и брался возврат
 * удалённой схемы с соседнего телефона: приём видел незнакомый файл и добавлял
 * его. Архивы без этого файла читаются по-прежнему — по именам.
 */
export const SCHEMA_INDEX_FILE = "index.json";
const SCHEMA_INDEX_VERSION = 1;

/**
 * Zip entries for a project's drawings.
 *
 * A drawing whose bytes have gone missing is skipped with a warning rather
 * than failing the export: the point of the archive is the data, and losing a
 * whole export over one absent file would be a poor trade.
 *
 * @param {{id: string, folderName?: string, name?: string, type?: string}} project
 * @param {Record<string, any>[]} schemas index entries
 * @param {(project: Record<string, any>, schema: object) => Promise<Blob|null>} readSchemaFile
 * @param {{dir?: string}} [options]
 * @returns {Promise<{path: string, blob: Blob, name: string}[]>}
 */
export async function buildSchemaArchiveEntries(
  project,
  schemas,
  readSchemaFile,
  // The inventory archive files its drawings under "Schemes", beside "Photos".
  // Same bytes, a folder name chosen for the person opening that archive.
  { dir = SCHEMA_ARCHIVE_DIR } = {},
) {
  const used = new Set();
  const entries = [];
  const index = [];

  for (const schema of schemas ?? []) {
    if (!isLiveSchema(schema)) {
      // Надгробие едет записью в списке: файла у него нет и быть не может.
      index.push(schema);
      continue;
    }

    let blob = null;
    try {
      blob = await readSchemaFile(project, schema);
    } catch (error) {
      logger.warn("[schemas] skipped an unreadable drawing on export:", error);
    }
    if (!blob) continue;

    const name = allocateSchemaFileName(schema.name, used);
    used.add(name);
    entries.push({ path: `${dir}/${name}`, blob, name });
    // Имя файла в архиве не совпадает с именем схемы: его чистят и разводят
    // от совпадений. Связь между ними и держит эта запись.
    index.push({ ...schema, file: name });
  }

  if (index.length > 0) {
    entries.push({
      path: `${dir}/${SCHEMA_INDEX_FILE}`,
      blob: new Blob(
        [JSON.stringify({ version: SCHEMA_INDEX_VERSION, data: index })],
        { type: "application/json" },
      ),
      name: SCHEMA_INDEX_FILE,
    });
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
 * @param {{id: string, folderName?: string, name?: string, type?: string}} project the freshly created project
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

  const files = new Map();
  folder.forEach((relativePath, entry) => {
    if (!entry.dir) files.set(relativePath, entry);
  });

  const indexEntry = files.get(SCHEMA_INDEX_FILE);
  if (indexEntry) {
    files.delete(SCHEMA_INDEX_FILE);
    return await restoreFromIndex(project, files, indexEntry);
  }

  // Архив без списка — из версии, которая его ещё не писала. Читается как
  // раньше: по именам файлов, без надгробий, потому что их там нет.
  const known = new Set(
    (await SchemaRepository.listSchemas(project).catch(() => [])).map(
      schemaIdentity,
    ),
  );

  let restored = 0;
  let skipped = 0;

  for (const [relativePath, entry] of files) {
    try {
      const blob = await entry.async("blob");
      const schema = createSchemaEntry({
        name: relativePath,
        // A zip carries no media type, so the name is all there is to go on —
        // createSchemaEntry falls back to the extension for exactly this.
        type: "",
        size: blob.size,
      });

      if (!isSupportedSchema(schema) || known.has(schemaIdentity(schema))) {
        skipped += 1;
        continue;
      }
      known.add(schemaIdentity(schema));

      await SchemaRepository.addSchema(project, schema, blob);
      restored += 1;
    } catch (error) {
      logger.warn(`[schemas] could not restore "${relativePath}":`, error);
      skipped += 1;
    }
  }

  return { restored, skipped };
}

/**
 * Приём архива, который несёт список схем.
 *
 * Списки сводятся, а не складываются: у записи есть время, и надгробие удаления
 * спорит с добавлением на равных. После сведения на устройстве остаётся ровно
 * то, что победило, — чертежи, которых здесь ещё нет, забираются из архива, а
 * те, что удалили на другом телефоне, уходят вместе с байтами.
 */
async function restoreFromIndex(project, files, indexEntry) {
  let incoming = [];
  try {
    const parsed = JSON.parse(await indexEntry.async("string"));
    incoming = Array.isArray(parsed?.data) ? parsed.data : [];
  } catch (error) {
    logger.warn("[schemas] could not read the archive schema list:", error);
    return { restored: 0, skipped: files.size };
  }

  const local = await SchemaRepository.readIndex(project).catch(() => []);
  const merged = mergeSchemaLists(local, incoming);
  const survivors = new Set(liveSchemas(merged).map(schemaIdentity));

  // Сначала уходят чертежи, которых сведение больше не оставило: их удалили на
  // другом телефоне. `removeSchema` убирает и байты, и запись — список ниже
  // всё равно перезаписывается сведённым.
  for (const schema of liveSchemas(local)) {
    if (survivors.has(schemaIdentity(schema))) continue;
    await SchemaRepository.removeSchema(project, schema);
  }

  const stored = new Set(liveSchemas(local).map(schemaIdentity));
  let restored = 0;
  let skipped = 0;

  for (const schema of liveSchemas(merged)) {
    const identity = schemaIdentity(schema);
    if (!identity || stored.has(identity)) continue;

    const entry = schema.file ? files.get(schema.file) : null;
    if (!entry || !isSupportedSchema(schema)) {
      skipped += 1;
      continue;
    }
    try {
      // Запись берётся из архива целиком, вместе со своим временем добавления:
      // оно и решает споры с надгробиями при следующем обмене. Своё `file`
      // остаётся в архиве — хранилищу оно ни к чему.
      const entryToStore = { ...schema };
      delete entryToStore.file;
      await SchemaRepository.addSchema(
        project,
        entryToStore,
        await entry.async("blob"),
      );
      restored += 1;
    } catch (error) {
      logger.warn(`[schemas] could not restore "${schema.name}":`, error);
      skipped += 1;
    }
  }

  await SchemaRepository.saveIndex(project, mergeSchemaLists(merged, [])).catch(
    (error) =>
      logger.warn("[schemas] could not write the merged schema list:", error),
  );

  return { restored, skipped };
}
