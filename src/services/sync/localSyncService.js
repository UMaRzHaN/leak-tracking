import { appError } from "@/utils/appError";
import {
  assertNativeAndroid,
  isNativeAndroid,
} from "@/services/sync/localSyncPlatform";
import { openArchiveChannel } from "@/services/sync/archiveUploadChannel";
import { LocalSync } from "@/services/sync/localSyncPlugin";
import { archiveResultToFile } from "@/services/sync/receivedArchive";
import { ignoredError } from "@/utils/ignoredError";
import { IMPORT_LIMITS } from "@/utils/importLimits";

const ARCHIVE_CHUNK_BYTES = 512 * 1024;

// Cleanups on a path that is already ending: the transfer either finished or
// failed, and a temporary archive or a listener left behind is worth a line in
// the diagnostics but never a failure of its own.
const ignoreDiscard = ignoredError("localSync.discardArchive");
const ignoreChannelEnd = ignoredError("localSync.closeArchiveChannel");
const ignoreListener = ignoredError("localSync.removeListener");
const ignoreApproval = ignoredError("localSync.resolveApproval");

export const LOCAL_SYNC_SESSION_DURATION_MS = 3 * 60 * 1000;

function normalizeSessionId(value) {
  const sessionId = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId,
    )
  ) {
    throw appError(
      "QR_SESSION_INVALID",
      "Некорректный идентификатор QR-сеанса",
    );
  }
  return sessionId;
}

function blobChunkToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(
        reader.error ??
          appError("ARCHIVE_READ_FAILED", "Не удалось прочитать архив"),
      );
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const separator = value.indexOf(",");
      if (separator < 0) {
        reject(
          appError("ARCHIVE_PREPARE_FAILED", "Не удалось подготовить архив"),
        );
        return;
      }
      resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function toBlob(value) {
  if (value instanceof Blob) return value;
  if (value instanceof Uint8Array) {
    return new Blob([value.slice().buffer]);
  }
  if (value instanceof ArrayBuffer) return new Blob([value]);
  throw new TypeError(
    "Archive chunk must be a Blob, Uint8Array or ArrayBuffer",
  );
}

/**
 * Кладёт архив в подготовленный нативный файл и возвращает его токен.
 *
 * @param {{
 *   archive?: Blob|null,
 *   produceArchive?: ((append: (chunk: unknown) => Promise<void>, maxBytes: number) => Promise<number|void>)|null,
 * }} source готовый архив или тот, кто напишет его кусками
 */
export async function prepareNativeArchive({
  archive = null,
  produceArchive = null,
}) {
  if (!(archive instanceof Blob) && typeof produceArchive !== "function") {
    throw new TypeError("archive or produceArchive is required");
  }
  const prepared = await LocalSync.prepareArchive();
  const token = prepared?.token;
  const nativeLimit = Number(prepared?.maxArchiveBytes);
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    !Number.isSafeInteger(nativeLimit) ||
    nativeLimit <= 0
  ) {
    if (typeof token === "string" && token) {
      await LocalSync.discardArchive({ token }).catch(ignoreDiscard);
    }
    throw new Error("Native sync returned an invalid archive limit");
  }

  const maxArchiveBytes = Math.min(nativeLimit, IMPORT_LIMITS.maxFileBytes);
  const channel = await openArchiveChannel(token);
  let writtenBytes = 0;
  try {
    const append = async (value) => {
      const blob = toBlob(value);
      for (let offset = 0; offset < blob.size; offset += ARCHIVE_CHUNK_BYTES) {
        const chunk = blob.slice(offset, offset + ARCHIVE_CHUNK_BYTES);
        if (writtenBytes + chunk.size > maxArchiveBytes) {
          const limitMb = Math.floor(maxArchiveBytes / 1024 / 1024);
          throw appError(
            "ARCHIVE_OVER_LIMIT",
            `Архив синхронизации больше ${limitMb} МБ`,
            { limitMb },
          );
        }
        if (channel) {
          await channel.send(await chunk.arrayBuffer());
        } else {
          const chunkBase64 = await blobChunkToBase64(chunk);
          await LocalSync.appendArchiveChunk({ token, chunkBase64 });
        }
        writtenBytes += chunk.size;
      }
    };

    if (typeof produceArchive === "function") {
      const reportedSize = await produceArchive(append, maxArchiveBytes);
      if (
        reportedSize != null &&
        (!Number.isSafeInteger(reportedSize) || reportedSize !== writtenBytes)
      ) {
        throw appError(
          "ARCHIVE_SIZE_MISMATCH",
          "Размер подготовленного архива не совпадает",
        );
      }
    } else {
      await append(archive);
    }

    if (writtenBytes <= 0) {
      throw appError("ARCHIVE_EMPTY", "Архив синхронизации пуст");
    }
    return token;
  } catch (error) {
    await LocalSync.discardArchive({ token }).catch(ignoreDiscard);
    throw error;
  } finally {
    if (channel) {
      await channel.send("end").catch(ignoreChannelEnd);
      channel.close();
    }
  }
}

export function isLocalSyncAvailable() {
  return isNativeAndroid();
}

export const LOCAL_SYNC_MAX_ARCHIVE_BYTES = IMPORT_LIMITS.maxFileBytes;

export async function startLocalSyncHost({
  archive = null,
  produceArchive,
  projectKey,
  syncId,
  allowMultipleImports = false,
  onArchive,
  onError,
  onApprovalRequest,
  onSessionUpdate,
  onSessionEnded,
}) {
  assertNativeAndroid();
  const listeners = [];
  const addListener = async (eventName, callback) => {
    const listener = await LocalSync.addListener(eventName, callback);
    listeners.push(listener);
    return listener;
  };
  const removeListeners = async () => {
    await Promise.all(
      listeners.map((listener) => listener.remove().catch(ignoreListener)),
    );
  };

  try {
    await addListener("archiveReceived", async (archiveResult) => {
      try {
        const file = await archiveResultToFile(archiveResult);
        await onArchive(file);
      } catch (error) {
        onError?.(error);
      }
    });
    await addListener("syncError", ({ message, code }) => {
      onError?.(Object.assign(new Error(message), code ? { code } : {}));
    });
    await addListener("peerApprovalRequested", async (request) => {
      let approved = false;
      try {
        approved = Boolean(await onApprovalRequest?.(request));
      } catch {
        approved = false;
      }
      await LocalSync.resolvePeerApproval({
        requestId: request.requestId,
        approved,
      }).catch(ignoreApproval);
    });
    await addListener("hostSessionUpdated", (session) => {
      onSessionUpdate?.(session);
    });
    await addListener("hostSessionEnded", (event) => {
      onSessionEnded?.(event);
    });

    const archiveToken = await prepareNativeArchive({
      archive,
      produceArchive,
    });
    const session = await LocalSync.startHost({
      archiveToken,
      projectKey,
      syncId,
      allowMultipleImports,
      sessionDurationMs: LOCAL_SYNC_SESSION_DURATION_MS,
    });
    return {
      ...session,
      async stop() {
        await LocalSync.stopHost();
        await removeListeners();
      },
    };
  } catch (error) {
    await removeListeners();
    throw error;
  }
}

export async function exchangeLocalSyncArchive({
  host,
  port,
  code,
  fingerprint,
  archive = null,
  produceArchive,
  projectKey,
  syncId,
  sessionId,
}) {
  assertNativeAndroid();
  const archiveToken = await prepareNativeArchive({
    archive,
    produceArchive,
  });
  try {
    const result = await LocalSync.exchange({
      host: host.trim(),
      port: Number(port),
      code: code.trim(),
      fingerprint: fingerprint.replace(/[^0-9a-f]/gi, "").toUpperCase(),
      archiveToken,
      projectKey,
      syncId,
      sessionId: normalizeSessionId(sessionId),
    });
    return archiveResultToFile(result);
  } catch (error) {
    await LocalSync.discardArchive({ token: archiveToken }).catch(
      ignoreDiscard,
    );
    throw error;
  }
}

export async function fetchLocalSyncArchive({
  host,
  port,
  code,
  fingerprint,
  projectKey,
  syncId,
  sessionId,
}) {
  assertNativeAndroid();
  const result = await LocalSync.fetchArchive({
    host: host.trim(),
    port: Number(port),
    code: code.trim(),
    fingerprint: fingerprint.replace(/[^0-9a-f]/gi, "").toUpperCase(),
    projectKey,
    syncId,
    sessionId: normalizeSessionId(sessionId),
  });
  return archiveResultToFile(result, "local-sync-import.zip");
}
