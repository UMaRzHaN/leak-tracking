import { getJSZip } from "@/services/backup/runtime";
import {
  isInventorySheetSet,
  sheetNamesFromWorkbookXml,
} from "@/services/import/importRouting";

const WORKBOOK_MARKER = "xl/workbook.xml";

/**
 * Инвентаризация, приехавшая в архиве отчёта по утечкам.
 *
 * Экран экспорта кладёт её рядом с отчётом своей папкой (8a): книга, снимки
 * и чертежи — как в отдельной выгрузке, только не в корне. Импорт такой
 * архив принимает за отчёт по утечкам, и раньше папка рядом пропадала:
 * импорт инвентаризации берёт первую книгу архива, а это книга утечек.
 *
 * Здесь папка перекладывается в корень нового архива — ровно того, что отдаёт
 * отдельная выгрузка инвентаризации, — и дальше его читает обычный импорт
 * инвентаризации, со снимками и чертежами, без второй ветки разбора.
 *
 * @param {File|Blob} file архив отчёта
 * @returns {Promise<File|null>} архив инвентаризации или null, если её нет
 */
export async function extractBundledInventory(file) {
  const JSZip = (await getJSZip()).default;
  let zip;
  try {
    zip = await new JSZip().loadAsync(await file.arrayBuffer());
  } catch {
    return null;
  }

  const workbooks = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name].dir &&
      /\.xlsx$/i.test(name) &&
      name.includes("/") &&
      !name.startsWith("__MACOSX/"),
  );

  for (const name of workbooks) {
    let inner;
    try {
      inner = await new JSZip().loadAsync(
        await zip.file(name).async("arraybuffer"),
      );
    } catch {
      continue;
    }
    const marker = inner.file(WORKBOOK_MARKER);
    if (!marker) continue;
    if (
      !isInventorySheetSet(
        sheetNamesFromWorkbookXml(await marker.async("string")),
      )
    ) {
      continue;
    }

    const folder = name.slice(0, name.lastIndexOf("/") + 1);
    const rebased = new JSZip();
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.startsWith(folder)) continue;
      rebased.file(path.slice(folder.length), await entry.async("uint8array"));
    }
    const stem = name.slice(folder.length).replace(/\.xlsx$/i, "");
    const blob = await rebased.generateAsync({ type: "blob" });
    return new File([blob], `${stem}.zip`, { type: "application/zip" });
  }

  return null;
}

/**
 * Вливает такую инвентаризацию в проект, куда легли утечки из того же
 * архива. У проекта без реестра её некуда положить — тогда `no-registry`.
 *
 * @param {File|null} inventoryFile
 * @param {any} project
 */
export async function importBundledInventory(inventoryFile, project) {
  if (!inventoryFile || !project?.id) return null;
  const [
    { importInventoryFile },
    { hasComponentRegistry },
    { loadComponentRegistry },
  ] = await Promise.all([
    import("@/services/inventory/inventoryImport"),
    import("@/configs/componentRegistry.config"),
    import("@/configs/projectAdapter"),
  ]);
  if (!hasComponentRegistry(project)) return { status: "no-registry" };
  const registry = await loadComponentRegistry(project);
  const result = await importInventoryFile(inventoryFile, project, registry);
  return { status: "imported", ...result };
}
