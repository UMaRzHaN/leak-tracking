import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

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
        encoding: Encoding.UTF8,
      }).catch(() => null);
      if (!result) continue;

      const original = String(result.data || "[]");
      const parsed = JSON.parse(original);
      const leaks = Array.isArray(parsed) ? parsed : parsed?.data;
      if (!Array.isArray(leaks)) continue;
      const remappedLeaks = remapLeaks(leaks, oldFolderName, newFolderName);
      snapshots.push({
        fileName,
        original,
        updated: JSON.stringify(
          Array.isArray(parsed)
            ? remappedLeaks
            : { ...parsed, data: remappedLeaks },
        ),
      });
    }

    for (const snapshot of snapshots) {
      await Filesystem.writeFile({
        path: `${newRoot}/data/${snapshot.fileName}`,
        directory: Directory.Data,
        data: snapshot.updated,
        encoding: Encoding.UTF8,
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
          encoding: Encoding.UTF8,
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
