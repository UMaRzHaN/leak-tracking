import { logger } from "@/utils/logger";
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

/**
 * Everything in a project that is not a leak: the component registry with its
 * photographs, and the technological drawings.
 *
 * The import side has read all three out of an archive for a while; only the
 * xlsx export ever wrote them. A project carried across on a ZIP backup —
 * which is how a whole device is handed over — arrived with the leaks intact
 * and the walk missing, and nothing said so.
 *
 * Never throws. Each piece is added if it can be read, and a failure costs
 * that piece rather than the backup somebody is standing there waiting for.
 *
 * @param {(path: string, content: any) => any} add
 * @param {{project: {id: string, folderName?: string, name?: string, type?: string}, idbGet?: (id: string) => Promise<any>}} context
 */
async function addProjectAttachments(add, { project, idbGet }) {
  if (!project?.id) return;

  try {
    const { buildComponentArchiveEntry } = await import("./componentArchive");
    const registry = await buildComponentArchiveEntry(project, { idbGet });
    if (registry) {
      await add(registry.path, registry.content);
      for (const entry of registry.photoEntries ?? []) {
        await add(entry.path, entry.blob);
      }
    }
  } catch (error) {
    logger.warn("[backup] registry left out of the archive:", error);
  }

  try {
    const [{ buildSchemaArchiveEntries }, { SchemaRepository }] =
      await Promise.all([
        import("./schemaArchive"),
        import("@/repositories/SchemaRepository"),
      ]);
    // Весь список, вместе с надгробиями: без них удаление схемы не переживёт
    // обмена, и она вернётся с соседнего телефона.
    const schemas = await SchemaRepository.readIndex(project).catch(() => []);
    const entries = await buildSchemaArchiveEntries(
      project,
      schemas,
      (target, schema) => SchemaRepository.readSchemaFile(target, schema),
    );
    for (const entry of entries) await add(entry.path, entry.blob);
  } catch (error) {
    logger.warn("[backup] drawings left out of the archive:", error);
  }
}

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

  await addProjectAttachments((path, content) => zip.add(path, content), {
    project,
    idbGet,
  });

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

  await addProjectAttachments((path, content) => zip.file(path, content), {
    project,
    idbGet,
  });

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
