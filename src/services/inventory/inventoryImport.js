import { notifyComponentRegistryChanged } from "@/repositories/componentRegistrySignal";
import { liveComponents } from "@/domain/componentTombstones";
import { mergeComponentRegistries } from "@/domain/componentMerge";
import {
  mergeIncomingComponents,
  restoreComponentsFromArchive,
} from "@/services/backup/componentArchive";
import { restoreComponentPhotos } from "@/services/backup/componentPhotoArchive";
import { restoreSchemasFromArchive } from "@/services/backup/schemaArchive";
import { logger } from "@/utils/logger";
import { componentIdFromUid, parseInventorySheet } from "./inventorySheet";
import { mergeSheetEditsIntoCards } from "./inventorySheetMerge";
import { parseInventoryBackupSheet } from "./inventoryBackupSheet";

/**
 * Bringing an inventory in, whatever shape it arrives in.
 *
 * Three routes, in order of how much they carry:
 *
 *   архив со служебным листом или json  карточки, снимки, чертежи
 *   зип с книгой внутри                 видимый лист
 *   голый .xlsx                         видимый лист
 *
 * Полный путь предпочтителен везде, где он есть: видимый лист — это те же
 * карточки, разложенные в плоскую таблицу, и прочитать его вместо служебного
 * значило бы молча потерять снимки, историю и подписи.
 */

const getExcelJS = () => import("exceljs");
const getJSZip = () => import("jszip");

function isWorkbookName(name) {
  return /\.xlsx$/i.test(name) && !name.startsWith("__MACOSX/");
}

async function readWorkbook(data) {
  const ExcelJS = (await getExcelJS()).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

/**
 * The cards a workbook — loose or inside a zip — has to offer.
 *
 * @param {File|Blob} file
 * @param {{headers: string[], keysOrder: string[]}} excel
 * @returns {Promise<{components: Record<string, any>[], skipped: number}>}
 */
export async function readInventorySheetFile(file, excel) {
  const workbook = await openInventoryWorkbook(file);
  if (!workbook) return { components: [], skipped: 0 };
  return parseInventorySheet(workbook, excel);
}

/** Книга инвентаризации — голая или лежащая в архиве. */
async function openInventoryWorkbook(file, openedZip = null) {
  const isZip =
    /\.zip$/i.test(/** @type {File} */ (file)?.name ?? "") ||
    String(file?.type ?? "").includes("zip");

  if (!isZip && !openedZip) return readWorkbook(await file.arrayBuffer());

  const zip = openedZip ?? (await openZip(file));
  const entry = Object.keys(zip.files).find(
    (name) => !zip.files[name].dir && isWorkbookName(name),
  );
  if (!entry) return null;
  return readWorkbook(await zip.file(entry).async("arraybuffer"));
}

async function openZip(file) {
  const JSZip = (await getJSZip()).default;
  return new JSZip().loadAsync(await file.arrayBuffer());
}

/**
 * Карточки из служебного листа книги, лежащей в архиве.
 *
 * Снимки восстанавливаются здесь же и до сведения: карточка, выигравшая
 * слияние с путём в чужое хранилище, показывала бы пустую рамку там, где есть
 * фотография.
 *
 * @returns {Promise<{added: number, updated: number, conflicts: number}|null>}
 *   null — если служебного листа в архиве нет вовсе.
 */
async function restoreComponentsFromWorkbook(file, project, registry) {
  let zip;
  try {
    zip = await openZip(file);
  } catch {
    return null;
  }

  let cards;
  let sheetCards = [];
  try {
    const workbook = await openInventoryWorkbook(file, zip);
    cards = workbook ? parseInventoryBackupSheet(workbook) : null;
    // Видимый лист той же книги — это те же карточки, которые человек правит
    // в Excel. Слепок полнее, поэтому он остаётся основой, но игнорировать
    // правки нельзя: до этого они пропадали молча.
    if (cards?.length && workbook && registry?.excel) {
      sheetCards = parseInventorySheet(workbook, registry.excel).components;
    }
  } catch (error) {
    logger.warn("[inventory] служебный лист книги не прочитался:", error);
    return null;
  }
  if (!cards?.length) return null;

  const merged = mergeSheetEditsIntoCards(cards, sheetCards);
  const restored = await restoreComponentPhotos(zip, merged.cards, project);
  return mergeIncomingComponents(project, restored);
}

/**
 * Keeps a spreadsheet from overwriting what somebody walked out and wrote.
 *
 * A card that came from a sheet is identified by its number, so re-importing a
 * corrected sheet updates it. A card filled in on a device carries a UUID; a
 * row claiming the same number is a different record as far as the app can
 * tell, and the field card wins. Those rows are reported, not merged, because
 * the disagreement is between a person and a spreadsheet and only a person can
 * settle it.
 */
export function separateSheetCards(local, incoming) {
  const localIdByUid = new Map();
  for (const component of local) {
    const uid = String(component?.component_uid ?? "").trim();
    if (uid) localIdByUid.set(uid, component.id);
  }

  const mergeable = [];
  const shadowed = [];

  for (const card of incoming) {
    const existingId = localIdByUid.get(String(card.component_uid).trim());
    if (existingId && existingId !== componentIdFromUid(card.component_uid)) {
      shadowed.push(card);
      continue;
    }
    mergeable.push(card);
  }

  return { mergeable, shadowed };
}

/**
 * Merges an inventory file into a project's registry.
 *
 * @param {File|Blob} file
 * @param {{id: string, folderName?: string}} project
 * @param {{excel: {headers: string[], keysOrder: string[]}}} registry the project's registry declaration
 * @returns {Promise<{added: number, updated: number, conflicts: number, shadowed: number, skipped: number, source: "archive"|"sheet"|"none", schemas: number}>}
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

export async function importInventoryFile(file, project, registry) {
  const nothing = {
    added: 0,
    updated: 0,
    conflicts: 0,
    shadowed: 0,
    skipped: 0,
    source: /** @type {const} */ ("none"),
    schemas: 0,
  };
  if (!project?.id) return nothing;

  // Служебный лист книги — нынешние архивы; components.json рядом — те, что
  // выгружены до него, и ZIP-бэкапы проекта, которые несут его до сих пор.
  const archive =
    (await restoreComponentsFromWorkbook(file, project, registry)) ??
    (await restoreComponentsFromArchive(file, project));
  if (archive.added || archive.updated || archive.conflicts) {
    // Drawings ride in the same archive and are cheap to miss: the registry
    // screen shows both, and an inventory handed over without its schemes is
    // half a handover.
    let schemas = 0;
    try {
      schemas = (await restoreSchemasFromArchive(file, project)).restored;
    } catch (error) {
      logger.warn("[inventory] drawings not restored from the archive:", error);
    }
    return { ...nothing, ...archive, source: "archive", schemas };
  }

  const { components, skipped } = await readInventorySheetFile(
    file,
    registry.excel,
  );
  if (components.length === 0) return { ...nothing, skipped };

  const local = await (await componentRepository()).load(project);
  // Строки листа сличаются с карточками. Надгробие номера не занимает, и
  // строка на удалённый номер заводит карточку заново — с новым
  // идентификатором, так что прежнее удаление её не уносит: импорт листа
  // человек делает руками и именно этого от него и ждёт.
  const cards = liveComponents(local);
  const { mergeable, shadowed } = separateSheetCards(cards, components);
  // Строка листа ложится правками поверх карточки, а не заменяет её целиком.
  // В таблице нет ни истории осмотров, ни снимка, а слияние берёт победившую
  // карточку как есть: карточка, заведённая таблицей и потом осмотренная в
  // приложении, теряла на повторном импорте и историю, и фотографию.
  const edits = mergeSheetEditsIntoCards(cards, mergeable);
  const localCards = /** @type {Record<string, any>[]} */ (cards);
  const localById = new Map(localCards.map((card) => [card?.id, card]));
  // Правки создают новый объект, нетронутые карточки остаются прежними, —
  // так и отбираются те, ради которых стоит тревожить реестр.
  const touched = edits.cards.filter(
    (card) => localById.get(card?.id) !== card,
  );
  const { merged, added, updated, conflicts } = mergeComponentRegistries(
    local,
    touched,
  );
  await (await componentRepository()).save(project, merged);
  // Как и у архива: запись сделана мимо владельца списка, и он должен узнать.
  notifyComponentRegistryChanged();

  return {
    added,
    updated,
    conflicts: conflicts.length,
    shadowed: shadowed.length,
    skipped,
    source: "sheet",
    schemas: 0,
  };
}
