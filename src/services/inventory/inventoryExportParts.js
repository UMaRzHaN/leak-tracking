import { readProjectSettings } from "@/app/project/projectSettings";
import { fromEntries } from "@/utils/fromEntries";

const RECONCILE_KEYS = [
  "round",
  "date",
  "time",
  "component_uid",
  "scheme_tag",
  "component",
  "object",
  "to",
  "user",
  "previousPhoto",
  "photo",
];
import { buildExcelExportTexts } from "@/services/excelExport/exportTexts";

/**
 * Части выгрузки инвентаризации: книга, снимки, чертежи и подписи.
 *
 * Одни и те же для своего архива реестра и для отчёта по утечкам, куда
 * инвентаризацию кладут папкой рядом (8a). Всё тяжёлое грузится здесь, в
 * момент выгрузки, а не со страницей.
 *
 * @param {any} project
 * @param {{ idbGet: (id: string) => Promise<any>, t: (key: string, options?: any) => string, withPhotos?: boolean }} options
 * @returns {Promise<null|{fileStem: string, sheetSpec: any, registryEntry: any, schemaEntries: any[], texts: Record<string, any>}>}
 *   null — в реестре нечего выгружать.
 */
export async function prepareInventoryExport(
  project,
  { idbGet, t, withPhotos = true },
) {
  const [
    { buildInventoryFileStem, INVENTORY_PHOTO_DIR, INVENTORY_SCHEMA_DIR },
    { buildComponentSheetSpec },
    { buildComponentArchiveEntry },
    { buildSchemaArchiveEntries },
    { SchemaRepository },
  ] = await Promise.all([
    import("@/services/inventory/inventoryArchive"),
    import("@/services/excelExport/componentSheetSpec"),
    import("@/services/backup/componentArchive"),
    import("@/services/backup/schemaArchive"),
    import("@/repositories/SchemaRepository"),
  ]);

  const sheetSpec = await buildComponentSheetSpec(project);
  if (!sheetSpec) return null;

  const registryEntry = await buildComponentArchiveEntry(project, {
    idbGet,
    photoDir: INVENTORY_PHOTO_DIR,
  });
  const schemaEntries = await buildSchemaArchiveEntries(
    project,
    await SchemaRepository.readIndex(project).catch(() => []),
    (target, schema) => SchemaRepository.readSchemaFile(target, schema),
    { dir: INVENTORY_SCHEMA_DIR },
  );

  return {
    fileStem: buildInventoryFileStem(project.name),
    // Режим листа сверки — из настроек проекта: так его получат и свой
    // архив реестра, и папка инвентаризации в отчёте по утечкам.
    sheetSpec: {
      ...sheetSpec,
      reconcileExportMode: readProjectSettings(project?.id)
        .excelReconcileExportMode,
    },
    // Без фото (8a) — без файлов и без ссылок на них; карточки остаются.
    registryEntry: withPhotos
      ? registryEntry
      : { ...registryEntry, photoEntries: [], photoPaths: {} },
    schemaEntries,
    texts: buildInventoryTexts(t),
  };
}

/** Подписи книги инвентаризации. */
export function buildInventoryTexts(t) {
  return {
    ...buildExcelExportTexts(t),
    // Служебный лист подписан своими словами: реестр — не резервная
    // копия проекта, а то, что этот архив и есть.
    inventoryBackup: {
      sheet: t("components.export.inventoryBackup.sheet"),
      note: t("components.export.inventoryBackup.note"),
      fieldColumn: t("components.export.inventoryBackup.fieldColumn"),
      valueColumn: t("components.export.inventoryBackup.valueColumn"),
      summary: {
        components: t("components.export.inventoryBackup.summary.components"),
        withPhoto: t("components.export.inventoryBackup.summary.withPhoto"),
        version: t("components.export.inventoryBackup.summary.version"),
      },
    },
    reconcileSheet: {
      sheet: t("components.export.reconcileSheet.sheet"),
      unknownUser: t("components.export.historySheet.unknownUser"),
      photoOpen: t("excelExport.photo.open"),
      photoMissing: t("excelExport.photo.missing"),
      headers: fromEntries(
        RECONCILE_KEYS.map((key) => [
          key,
          t(`components.export.reconcileSheet.headers.${key}`),
        ]),
      ),
    },
    // Лист истории подписан своими словами: у железа заводят карточку и
    // осматривают, а не открывают и устраняют.
    componentHistory: {
      sheet: t("components.export.historySheet.sheet"),
      unknownUser: t("components.export.historySheet.unknownUser"),
      emptyValue: t("components.export.historySheet.emptyValue"),
      actions: {
        created: t("components.export.historySheet.actions.created"),
        edited: t("components.export.historySheet.actions.edited"),
        inspected: t("components.export.historySheet.actions.inspected"),
      },
      headers: {
        index: t("components.export.historySheet.headers.index"),
        component_uid: t(
          "components.export.historySheet.headers.component_uid",
        ),
        date: t("components.export.historySheet.headers.date"),
        time: t("components.export.historySheet.headers.time"),
        action: t("components.export.historySheet.headers.action"),
        user: t("components.export.historySheet.headers.user"),
        to: t("components.export.historySheet.headers.to"),
        changes: t("components.export.historySheet.headers.changes"),
      },
    },
  };
}
