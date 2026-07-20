import { Directory, Filesystem } from "@capacitor/filesystem";

const DATA_FILES = ["data.json", "data.backup.json"];

export async function renameNativeProjectFiles({
  oldFolderName,
  newFolderName,
  remapLeaks,
}) {
  const oldRoot = `LeakReports/${oldFolderName}`;
  const newRoot = `LeakReports/${newFolderName}`;

  try {
    await Filesystem.rename({
      from: oldRoot,
      to: newRoot,
      directory: Directory.Data,
    });
  } catch {
    return { folderRenamed: false, dataRemapped: false };
  }

  const snapshots = [];
  try {
    for (const fileName of DATA_FILES) {
      const path = `${newRoot}/data/${fileName}`;
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Data,
        encoding: "utf8",
      }).catch(() => null);
      if (!result) continue;

      const leaks = JSON.parse(result.data || "[]");
      if (!Array.isArray(leaks)) continue;
      snapshots.push({
        fileName,
        original: result.data || "[]",
        updated: JSON.stringify(
          remapLeaks(leaks, oldFolderName, newFolderName),
        ),
      });
    }

    for (const snapshot of snapshots) {
      await Filesystem.writeFile({
        path: `${newRoot}/data/${snapshot.fileName}`,
        directory: Directory.Data,
        data: snapshot.updated,
        encoding: "utf8",
      });
    }
  } catch {
    const rolledBack = await Filesystem.rename({
      from: newRoot,
      to: oldRoot,
      directory: Directory.Data,
    })
      .then(() => true)
      .catch(() => false);

    if (rolledBack) {
      for (const snapshot of snapshots) {
        await Filesystem.writeFile({
          path: `${oldRoot}/data/${snapshot.fileName}`,
          directory: Directory.Data,
          data: snapshot.original,
          encoding: "utf8",
        }).catch(() => {});
      }
    }
    return { folderRenamed: !rolledBack, dataRemapped: false };
  }

  await Filesystem.rename({
    from: oldFolderName,
    to: newFolderName,
    directory: Directory.Documents,
  }).catch(() => {});

  return { folderRenamed: true, dataRemapped: true };
}
