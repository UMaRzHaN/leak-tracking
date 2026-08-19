import { ComponentRepository } from "@/repositories/ComponentRepository";
import { mergeComponentRegistries } from "@/domain/componentMerge";
import { restoreComponentsFromArchive } from "@/services/backup/componentArchive";
import { restoreSchemasFromArchive } from "@/services/backup/schemaArchive";
import { logger } from "@/utils/logger";
import { componentIdFromUid, parseInventorySheet } from "./inventorySheet";

/**
 * Bringing an inventory in, whatever shape it arrives in.
 *
 * Three routes, in order of how much they carry:
 *
 *   an inventory or project archive  cards, photographs, drawings
 *   a zip holding a workbook         the sheet inside it
 *   a bare .xlsx                     the sheet
 *
 * The archive route is the whole thing and is preferred wherever a
 * `components.json` is present — the sheet is a flattened view of the same
 * cards, and reading it instead would silently drop the photographs.
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
 * @returns {Promise<{components: object[], skipped: number}>}
 */
export async function readInventorySheetFile(file, excel) {
  const buffer = await file.arrayBuffer();

  const isZip =
    /\.zip$/i.test(/** @type {File} */ (file)?.name ?? "") ||
    String(file?.type ?? "").includes("zip");
  if (!isZip) return parseInventorySheet(await readWorkbook(buffer), excel);

  const JSZip = (await getJSZip()).default;
  const zip = await new JSZip().loadAsync(buffer);
  const entry = Object.keys(zip.files).find(
    (name) => !zip.files[name].dir && isWorkbookName(name),
  );
  if (!entry) return { components: [], skipped: 0 };

  return parseInventorySheet(
    await readWorkbook(await zip.file(entry).async("arraybuffer")),
    excel,
  );
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

  const archive = await restoreComponentsFromArchive(file, project);
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

  const local = await ComponentRepository.load(project);
  const { mergeable, shadowed } = separateSheetCards(local, components);
  const { merged, added, updated, conflicts } = mergeComponentRegistries(
    local,
    mergeable,
  );
  await ComponentRepository.save(project, merged);

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
