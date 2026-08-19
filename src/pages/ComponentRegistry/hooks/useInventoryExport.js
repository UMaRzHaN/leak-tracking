import { useCallback, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { isNative } from "@/utils/platform";

/**
 * Sending the inventory out as its own archive.
 *
 * The registry screen gets its own button rather than borrowing the database
 * one because the two exports answer to different people: a leak report goes
 * to whoever tracks emissions, an inventory goes to whoever owns the
 * equipment. Handing over one has never meant handing over the other.
 *
 * Everything heavy is imported at the moment the button is pressed. The
 * registry screen is already outside the entry graph and must stay that way —
 * exceljs and jszip together are larger than the whole screen.
 */
export function useInventoryExport({ project, notify }) {
  const { t } = useLanguage();
  const { getPhoto: idbGetPhoto } = usePhotoStorage();
  const [isExporting, setIsExporting] = useState(false);

  const exportInventory = useCallback(async () => {
    if (isExporting || !project?.id) return;

    try {
      setIsExporting(true);
      notify?.("info", t("components.export.inProgress"), { autoCloseMs: 0 });

      const [
        {
          buildInventoryArchive,
          buildInventoryFileStem,
          INVENTORY_EXPORT_DIR,
          INVENTORY_PHOTO_DIR,
          INVENTORY_SCHEMA_DIR,
        },
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
      if (!sheetSpec) {
        notify?.("warning", t("components.export.empty"));
        return;
      }

      const registryEntry = await buildComponentArchiveEntry(project, {
        idbGet: idbGetPhoto,
        photoDir: INVENTORY_PHOTO_DIR,
      });
      const schemaEntries = await buildSchemaArchiveEntries(
        project,
        await SchemaRepository.listSchemas(project).catch(() => []),
        (target, schema) => SchemaRepository.readSchemaFile(target, schema),
        { dir: INVENTORY_SCHEMA_DIR },
      );

      const fileStem = buildInventoryFileStem(project.name);
      const blob = await buildInventoryArchive({
        fileStem,
        sheetSpec,
        registryEntry,
        schemaEntries,
      });
      const fileName = `${fileStem}.zip`;

      if (isNative) {
        // Its own folder inside the project's, next to the leak exports rather
        // than mixed in with them: on a phone the two are told apart by where
        // they sit, because both are zips with a long name.
        const folder = project.folderName
          ? `${project.folderName}/${INVENTORY_EXPORT_DIR}`
          : INVENTORY_EXPORT_DIR;
        const { writePublicFile } =
          await import("@/services/storage/publicFileWriter");
        await writePublicFile({
          folder,
          fileName,
          blob,
          mimeType: "application/zip",
        });
        notify?.(
          "success",
          t("components.export.saved", { path: `${folder}/${fileName}` }),
        );
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        notify?.("success", t("components.export.downloaded", { fileName }));
      }
    } catch (error) {
      notify?.(
        "error",
        t("components.export.error", { message: error.message }),
      );
    } finally {
      setIsExporting(false);
    }
  }, [idbGetPhoto, isExporting, notify, project, t]);

  return { exportInventory, isExporting };
}
