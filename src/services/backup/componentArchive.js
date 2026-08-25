import { notifyComponentRegistryChanged } from "@/repositories/componentRegistrySignal";
import { mergeComponentRegistries } from "@/domain/componentMerge";
import { liveComponents } from "@/domain/componentTombstones";
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

/**
 * `ComponentRepository` тянет за собой мост Capacitor и нативное хранилище
 * карточек. Статический импорт клал его в стартовый чанк — сборка предупреждала
 * об этом прямо, — хотя нужен он только тем, кто уже открыл реестр, экспорт или
 * импорт. Здесь он читается на месте вызова.
 */
function componentRepository() {
  return import("@/repositories/ComponentRepository").then(
    (module) => module.ComponentRepository,
  );
}

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
 * @param {{id: string, folderName?: string, name?: string, type?: string}} project
 * @param {{load?: (project: object) => Promise<object[]>, idbGet?: (id: string) => Promise<any>, photoDir?: string}} [options]
 */
export async function buildComponentArchiveEntry(project, options = {}) {
  if (!project?.id) return null;

  const {
    load = async (target) => (await componentRepository()).load(target),
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
      // Карточки с уже переписанными путями к снимкам. Архив инвентаризации
      // кладёт их служебным листом в саму книгу, а не файлом рядом.
      components,
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
 * @param {{id: string, folderName?: string, name?: string, type?: string}} project
 * @returns {Promise<{added: number, updated: number, removed: number, conflicts: number}>}
 */
/**
 * Что случится с реестром, если этот архив принять, — без единой записи.
 *
 * Диалог «проект уже существует» до этого считал только утечки и показывал
 * ряд нулей архиву, который вёз полтора десятка карточек: человек решал
 * судьбу реестра, ничего о нём не зная.
 *
 * Снимки здесь намеренно не восстанавливаются: предпросмотр не должен ничего
 * писать на диск. Поэтому карточки сравниваются как есть, и «фото» считается
 * по тому, что лежит в архиве.
 *
 * @param {File|Blob} file
 * @param {{id: string, folderName?: string}|null} project
 * @returns {Promise<{added: number, updated: number, removed: number, total: number, photos: number}|null>}
 *   null — если реестра в архиве нет вовсе.
 */
export async function previewArchiveComponents(file, project) {
  try {
    const JSZip = (await getJSZip()).default;
    const zip = await new JSZip().loadAsync(file);
    const entry = zip.file(COMPONENT_ARCHIVE_FILE);
    if (!entry) return null;

    const incoming = unwrap(JSON.parse(await entry.async("string")));
    if (!Array.isArray(incoming) || incoming.length === 0) return null;

    const local = project
      ? await (await componentRepository()).load(project)
      : [];
    const { added, updated, removed } = mergeComponentRegistries(
      local,
      incoming,
    );
    // Считается то, что человек увидит: записи об удалённых карточках едут
    // вместе с ними, но карточками не являются.
    const cards = liveComponents(incoming);
    const photos = cards.filter((card) =>
      String(card?.photo ?? "").startsWith("zip:"),
    ).length;

    return { added, updated, removed, total: cards.length, photos };
  } catch (error) {
    // Нечитаемый реестр не отменяет импорт утечек: диалог просто промолчит
    // о карточках, как молчал раньше.
    logger.warn("[components] could not preview the archive registry:", error);
    return null;
  }
}

export async function restoreComponentsFromArchive(file, project) {
  const nothing = { added: 0, updated: 0, removed: 0, conflicts: 0 };
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
  return mergeIncomingComponents(project, incoming);
}

/**
 * Сводит приехавшие карточки с теми, что уже есть, и сохраняет результат.
 *
 * Вынесено отдельно, потому что путей, по которым карточки приезжают, стало
 * два: json рядом с книгой у прежних архивов и служебный лист внутри книги у
 * нынешних. Сведение у них одно и то же, и расходиться ему незачем.
 *
 * @param {{id: string, folderName?: string, name?: string, type?: string}} project
 * @param {object[]} incoming
 */
export async function mergeIncomingComponents(project, incoming) {
  try {
    const local = await (await componentRepository()).load(project);
    const { merged, added, updated, removed, conflicts } =
      mergeComponentRegistries(local, incoming);

    await (await componentRepository()).save(project, merged);
    // Список реестра держит владелец на стороне экрана, и эта запись прошла
    // мимо него: без сигнала он показывал бы то, что прочитал до импорта.
    notifyComponentRegistryChanged();
    return { added, updated, removed, conflicts: conflicts.length };
  } catch (error) {
    logger.warn("[components] could not merge the incoming registry:", error);
    return { added: 0, updated: 0, removed: 0, conflicts: 0 };
  }
}
