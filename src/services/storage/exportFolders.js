/**
 * Where exported files land on a device.
 *
 * A finished project produces several kinds of file, and they used to be
 * scattered: the ZIP backup at the root of the project folder, the report
 * archive two levels down under `export/xlsx`, and nothing at all telling a
 * person which was which. On a phone, with two zips whose names both begin
 * with the project's, the folder is the only thing that distinguishes them.
 *
 * So: one folder per subject. Everything about the leaks under `Leaks`, split
 * by what the file is; everything about the equipment under `Inventorization`.
 * The names are in Latin script deliberately — these paths are typed into file
 * managers and read over the phone.
 */

export const LEAK_EXPORT_ROOT = "Leaks";
export const LEAK_BACKUP_DIR = `${LEAK_EXPORT_ROOT}/zip_backup`;
export const LEAK_XLSX_DIR = `${LEAK_EXPORT_ROOT}/zip_xlsx`;
export const LEAK_KML_DIR = `${LEAK_EXPORT_ROOT}/kml`;
export const INVENTORY_EXPORT_DIR = "Inventorization";
export const INVENTORY_KML_DIR = `${INVENTORY_EXPORT_DIR}/kml`;

/** Joins a project's own folder with one of the directories above. */
export function projectExportFolder(projectFolderName, dir) {
  return projectFolderName ? `${projectFolderName}/${dir}` : dir;
}
