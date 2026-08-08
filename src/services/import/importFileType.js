/** Pure file-type probe shared by the main thread and the import worker. */
export function isZipFile(file) {
  return (
    /\.zip$/i.test(file?.name ?? "") || String(file?.type ?? "").includes("zip")
  );
}
