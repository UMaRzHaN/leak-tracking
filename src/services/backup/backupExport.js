import { readProjectSettings } from "@/app/project/projectSettings";
import { readProjectSyncStateAsync } from "@/services/sync/projectSyncState";
import { allocateUniqueLeakArchiveSegments } from "@/services/archive/archivePaths";
import { readMonitoringRound } from "@/utils/monitoringRound";
import { assertImportFileSize, IMPORT_LIMITS } from "@/utils/importLimits";
import { RECOVERY_RECORDS_FILE } from "./constants";
import { parseRecoveryValidation } from "./archiveParser";
import {
  exportLeaksWithPhotos,
  exportLeaksWithPhotosToStream,
} from "./photoArchive";
import { buildProjectMeta } from "./projectMeta";
import { getJSZip, yieldToMainThread } from "./runtime";

export async function buildBackupZip(leaks, idbGet) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet);
  await yieldToMainThread();
  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));
  await yieldToMainThread();
  const blob = await zip.generateAsync({ type: "blob" });
  assertImportFileSize(blob);
  return blob;
}

export async function streamProjectBackupZip({
  leaks,
  recoveryRecords = [],
  idbGet,
  project,
  vars,
  writeChunk,
}) {
  const { ZipStoreStreamWriter } =
    await import("@/services/archive/zipStoreStream");
  const zip = new ZipStoreStreamWriter(writeChunk, {
    maxBytes: IMPORT_LIMITS.maxExportBytes,
  });
  const validatedRecovery = recoveryRecords.length
    ? parseRecoveryValidation(recoveryRecords)
    : [];
  const leakSegments = allocateUniqueLeakArchiveSegments(leaks);
  const recoveryLeakSegments = allocateUniqueLeakArchiveSegments(
    validatedRecovery,
    { prefix: "recovery", reservedSegments: leakSegments },
  );
  const exportedLeaks = await exportLeaksWithPhotosToStream(
    leaks,
    zip,
    idbGet,
    {
      leakSegments,
    },
  );
  await zip.add("backup.json", JSON.stringify(exportedLeaks, null, 2));
  if (validatedRecovery.length) {
    const exportedRecovery = await exportLeaksWithPhotosToStream(
      validatedRecovery,
      zip,
      idbGet,
      {
        segmentPrefix: "recovery",
        preserveUnresolvedPhotoPaths: true,
        leakSegments: recoveryLeakSegments,
      },
    );
    await zip.add(
      RECOVERY_RECORDS_FILE,
      JSON.stringify(exportedRecovery, null, 2),
    );
  }

  const meta = buildProjectMeta({
    project,
    vars,
    settings: readProjectSettings(project?.id),
    monitoringRound: readMonitoringRound(project?.id),
    syncState: await readProjectSyncStateAsync(project?.id),
  });
  if (meta) await zip.add("project.json", JSON.stringify(meta, null, 2));
  return zip.close();
}
export async function buildProjectBackupZip({
  leaks,
  recoveryRecords = [],
  idbGet,
  project,
  vars,
}) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();

  const validatedRecovery = recoveryRecords.length
    ? parseRecoveryValidation(recoveryRecords)
    : [];
  const leakSegments = allocateUniqueLeakArchiveSegments(leaks);
  const recoveryLeakSegments = allocateUniqueLeakArchiveSegments(
    validatedRecovery,
    { prefix: "recovery", reservedSegments: leakSegments },
  );
  const exportedLeaks = await exportLeaksWithPhotos(leaks, zip, idbGet, {
    leakSegments,
  });
  await yieldToMainThread();
  zip.file("backup.json", JSON.stringify(exportedLeaks, null, 2));
  if (validatedRecovery.length) {
    const exportedRecovery = await exportLeaksWithPhotos(
      validatedRecovery,
      zip,
      idbGet,
      {
        segmentPrefix: "recovery",
        preserveUnresolvedPhotoPaths: true,
        leakSegments: recoveryLeakSegments,
      },
    );
    zip.file(RECOVERY_RECORDS_FILE, JSON.stringify(exportedRecovery, null, 2));
  }

  const meta = buildProjectMeta({
    project,
    vars,
    settings: readProjectSettings(project?.id),
    monitoringRound: readMonitoringRound(project?.id),
    syncState: await readProjectSyncStateAsync(project?.id),
  });
  if (meta) zip.file("project.json", JSON.stringify(meta, null, 2));

  await yieldToMainThread();
  const blob = await zip.generateAsync({ type: "blob" });
  assertImportFileSize(blob);
  return blob;
}

export async function exportBackupZip(leaks, idbGet, projectName = "backup") {
  const blob = await buildBackupZip(leaks, idbGet);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
