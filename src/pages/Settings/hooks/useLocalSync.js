import { appError } from "@/utils/appError";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorText } from "@/utils/appError";
import { localSyncErrorText } from "@/services/sync/localSyncErrorText";
import {
  cancelLocalSyncQrScan,
  createLocalSyncQrSvg,
  scanLocalSyncQr,
} from "@/services/sync/localSyncQr";
import {
  exchangeLocalSyncArchive,
  fetchLocalSyncArchive,
  isLocalSyncAvailable,
  startLocalSyncHost,
} from "@/services/sync/localSyncService";
import {
  buildProjectKey,
  resolveScanIntent,
  SCAN_INTENT_SYNC,
} from "@/services/sync/scanIntent";
import { ignoredError } from "@/utils/ignoredError";

const IDLE_STATE = { status: "idle", session: null };

function typeLabel(type, t) {
  const labels = {
    upstream: t("settings.projectTypes.upstream"),
    midstream: t("settings.projectTypes.midstream"),
    downstream: t("settings.projectTypes.downstream"),
  };
  return labels[type] ?? type ?? t("settings.unknown");
}

function syncErrorMessage(error, t) {
  if (hasPluginSyncErrorText(error)) {
    return localSyncErrorText(error, i18next.t.bind(i18next));
  }
  if (error?.code === "SYNC_EPOCH_MISMATCH") {
    return t("settings.oldDeletionHistoryWas");
  }
  if (error?.code === "PROJECT_TYPE_MISMATCH") {
    const current = typeLabel(error.existingProjectType, t);
    const incoming = typeLabel(error.incomingProjectType, t);
    return t("settings.projectsOfDifferentTypes2", {
      v1: current,
      v2: incoming,
    });
  }
  if (error?.code === "PROJECT_TYPE_MISSING") {
    return t("settings.theReceivedArchiveDoes");
  }
  if (error?.code === "CURRENT_PROJECT_TYPE_MISSING") {
    return t("settings.theCurrentProjectHas2");
  }
  // Ниже — коды, которые бросает JS этого же экрана: создание идентификатора,
  // сканирование, подготовка архива. Без этого они доезжали сюда русским
  // текстом и так и показывались в английском интерфейсе.
  return errorText(error, t);
}

function isStructuredSyncError(error) {
  return (
    error?.code === "SYNC_EPOCH_MISMATCH" ||
    error?.code?.includes("PROJECT_TYPE") ||
    hasPluginSyncErrorText(error)
  );
}

// True when the Android plugin tagged the failure with a code this build can
// translate. A peer on an older build sends no code, and an unknown code means
// a newer peer, so both fall through to the plugin's own message.
function hasPluginSyncErrorText(error) {
  const code = error?.code;
  return Boolean(code) && i18next.exists(`syncErrors.${code}`);
}

export function useLocalSync({
  activeProject,
  data,
  idbGetPhoto,
  vars,
  onImportZip,
  onImportIntoExisting,
  notify,
  t,
  ensureProjectSyncId,
}) {
  const [state, setState] = useState(IDLE_STATE);
  const [allowMultipleImports, setAllowMultipleImports] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState(null);
  const hostSessionRef = useRef(null);
  const approvalResolverRef = useRef(null);
  const approvalTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const operationGenerationRef = useRef(0);
  const activeProjectId = activeProject?.id ?? null;
  const activeProjectIdRef = useRef(activeProjectId);
  const observedProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const available = useMemo(() => isLocalSyncAvailable(), []);

  // Guards every setState below: once unmounted, in-flight sync/import
  // callbacks (host archive received, QR scan resolved, etc.) can still
  // finish their real work, but must stop touching component state.
  const setStateSafe = useCallback((next) => {
    if (!mountedRef.current) return;
    setState(next);
  }, []);
  const beginProjectOperation = useCallback(() => {
    operationGenerationRef.current += 1;
    return {
      generation: operationGenerationRef.current,
      projectId: activeProjectIdRef.current,
    };
  }, []);
  const isProjectOperationCurrent = useCallback(
    (operation) =>
      mountedRef.current &&
      operationGenerationRef.current === operation?.generation &&
      activeProjectIdRef.current === operation?.projectId,
    [],
  );

  const streamArchive = useCallback(
    async (writeChunk, project = activeProject) => {
      if (!project) {
        throw new Error(t("settings.noProjectSelected"));
      }
      const { streamProjectBackupZip } =
        await import("@/services/backup/projectBackupService");
      return streamProjectBackupZip({
        leaks: data,
        idbGet: idbGetPhoto,
        project,
        vars,
        writeChunk,
      });
    },
    [activeProject, data, idbGetPhoto, t, vars],
  );

  const mergeArchive = useCallback(
    async (file, targetProject = activeProject) => {
      const result = await onImportIntoExisting(file, targetProject, "sync");
      notify(
        "success",
        t("settings.syncCompleteVChanges", { v1: result.leakCount }),
      );
      return result;
    },
    [activeProject, notify, onImportIntoExisting, t],
  );

  const stopHost = useCallback(async () => {
    if (approvalTimeoutRef.current) {
      window.clearTimeout(approvalTimeoutRef.current);
      approvalTimeoutRef.current = null;
    }
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = null;
    setApprovalRequest(null);
    const session = hostSessionRef.current;
    hostSessionRef.current = null;
    if (session) await session.stop();
    setStateSafe(IDLE_STATE);
  }, [setStateSafe]);
  const startHost = useCallback(async () => {
    const operation = beginProjectOperation();
    setStateSafe({ status: "preparing", session: null });
    try {
      const syncProject = ensureProjectSyncId?.(activeProject?.id);
      if (!syncProject?.syncId) {
        throw appError(
          "SYNC_ID_CREATE_FAILED",
          "Не удалось создать идентификатор синхронизации",
        );
      }
      const identity = {
        projectKey: buildProjectKey(syncProject),
        syncId: syncProject.syncId,
      };
      const session = await startLocalSyncHost({
        produceArchive: (writeChunk) => streamArchive(writeChunk, syncProject),
        ...identity,
        allowMultipleImports,
        onApprovalRequest: (request) =>
          new Promise((resolve) => {
            if (!isProjectOperationCurrent(operation)) {
              resolve(false);
              return;
            }
            if (approvalTimeoutRef.current) {
              window.clearTimeout(approvalTimeoutRef.current);
            }
            approvalResolverRef.current?.(false);
            approvalResolverRef.current = resolve;
            setApprovalRequest(request);
            approvalTimeoutRef.current = window.setTimeout(() => {
              approvalTimeoutRef.current = null;
              approvalResolverRef.current = null;
              setApprovalRequest(null);
              resolve(false);
            }, 25_000);
          }),
        onSessionUpdate: (update) => {
          if (!isProjectOperationCurrent(operation)) return;
          setStateSafe((current) =>
            current.status === "hosting" && current.session
              ? {
                  ...current,
                  session: { ...current.session, ...update },
                }
              : current,
          );
        },
        onSessionEnded: ({ reason, transferCount }) => {
          if (!isProjectOperationCurrent(operation)) return;
          if (approvalTimeoutRef.current) {
            window.clearTimeout(approvalTimeoutRef.current);
            approvalTimeoutRef.current = null;
          }
          approvalResolverRef.current?.(false);
          approvalResolverRef.current = null;
          setApprovalRequest(null);
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          activeSession?.stop().catch(ignoredError("localSync.stopSession"));
          setStateSafe(IDLE_STATE);
          if (reason === "expired") {
            notify("info", t("settings.theQrCodeHas"));
          } else if (reason === "completed") {
            notify(
              "success",
              t("settings.transferCompleteDevicesV", {
                v1: transferCount ?? 1,
              }),
            );
          }
        },
        onArchive: async (file) => {
          if (!isProjectOperationCurrent(operation)) return;
          setStateSafe((current) => ({ ...current, status: "merging" }));
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          try {
            if (!isProjectOperationCurrent(operation)) return;
            await mergeArchive(file, syncProject);
            if (isProjectOperationCurrent(operation)) {
              setStateSafe({ status: "complete", session: null });
            }
          } finally {
            await activeSession
              ?.stop()
              .catch(ignoredError("localSync.stopSession"));
          }
        },
        onError: (error) => {
          if (!isProjectOperationCurrent(operation)) return;
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          activeSession?.stop().catch(ignoredError("localSync.stopSession"));
          notify(
            "error",
            isStructuredSyncError(error)
              ? syncErrorMessage(error, t)
              : `${t("settings.localSyncError")}: ${errorText(error, t)}`,
          );
          setStateSafe(IDLE_STATE);
        },
      });
      if (!isProjectOperationCurrent(operation)) {
        await session.stop().catch(ignoredError("localSync.stopSession"));
        return;
      }
      hostSessionRef.current = session;
      const qrSvg = await createLocalSyncQrSvg(session, identity);
      if (!isProjectOperationCurrent(operation)) {
        if (hostSessionRef.current === session) {
          hostSessionRef.current = null;
          await session.stop().catch(ignoredError("localSync.stopSession"));
        }
        return;
      }
      setStateSafe({ status: "hosting", session: { ...session, qrSvg } });
    } catch (error) {
      if (!isProjectOperationCurrent(operation)) return;
      const activeSession = hostSessionRef.current;
      hostSessionRef.current = null;
      await activeSession?.stop().catch(ignoredError("localSync.stopSession"));
      setStateSafe(IDLE_STATE);
      notify(
        "error",
        `${t("settings.couldNotCreateSession")}: ${errorText(error, t)}`,
      );
    }
  }, [
    activeProject,
    allowMultipleImports,
    beginProjectOperation,
    ensureProjectSyncId,
    isProjectOperationCurrent,
    mergeArchive,
    notify,
    setStateSafe,
    streamArchive,
    t,
  ]);

  const joinHost = useCallback(
    async (
      { host, port, code, fingerprint, syncId: connectionSyncId, sessionId },
      existingOperation,
    ) => {
      const operation = existingOperation ?? beginProjectOperation();
      if (!isProjectOperationCurrent(operation)) return;
      setStateSafe({ status: "joining", session: null });
      try {
        const incoming = await exchangeLocalSyncArchive({
          host,
          port,
          code,
          fingerprint,
          produceArchive: (writeChunk) => streamArchive(writeChunk),
          projectKey: buildProjectKey(activeProject),
          syncId: activeProject?.syncId ?? connectionSyncId ?? "",
          sessionId,
        });
        if (!isProjectOperationCurrent(operation)) return;
        setStateSafe({ status: "merging", session: null });
        await mergeArchive(incoming);
        if (isProjectOperationCurrent(operation)) {
          setStateSafe({ status: "complete", session: null });
        }
      } catch (error) {
        if (!isProjectOperationCurrent(operation)) return;
        setStateSafe(IDLE_STATE);
        notify(
          "error",
          isStructuredSyncError(error)
            ? syncErrorMessage(error, t)
            : `${t("settings.connectionError")}: ${errorText(error, t)}`,
        );
      }
    },
    [
      activeProject,
      beginProjectOperation,
      isProjectOperationCurrent,
      mergeArchive,
      notify,
      setStateSafe,
      streamArchive,
      t,
    ],
  );

  /**
   * Одна кнопка на оба сценария.
   *
   * Код опознаёт базу, поэтому спрашивать человека, что он собирается делать,
   * не нужно: если это база открытого проекта — синхронизация, если чужая —
   * импорт. Прежние две кнопки заставляли выбирать вслепую, до того как камера
   * что-либо увидела, и неверный выбор давал не другой результат, а отказ.
   */
  const scanAndConnect = useCallback(async () => {
    const operation = beginProjectOperation();
    setStateSafe({ status: "scanning", session: null });
    try {
      // Без ожидаемого проекта: чужой код здесь не ошибка, а импорт.
      const connection = await scanLocalSyncQr();
      if (!isProjectOperationCurrent(operation)) return;

      if (resolveScanIntent(connection, activeProject) === SCAN_INTENT_SYNC) {
        await joinHost(connection, operation);
        return;
      }

      setStateSafe({ status: "importing", session: null });
      const incoming = await fetchLocalSyncArchive(connection);
      if (!isProjectOperationCurrent(operation)) return;
      const result = await onImportZip?.(incoming);
      notify(
        "success",
        t("settings.databaseImportedByQr", {
          v1: result?.project?.name ?? "project",
          v2: result?.leakCount ?? 0,
        }),
      );
      setStateSafe({ status: "complete", session: null });
    } catch (error) {
      if (!isProjectOperationCurrent(operation)) return;
      setStateSafe(IDLE_STATE);
      if (error.code === "QR_SCAN_CANCELLED") return;
      notify("error", `${t("settings.qrCodeError")}: ${errorText(error, t)}`);
    }
  }, [
    activeProject,
    beginProjectOperation,
    isProjectOperationCurrent,
    joinHost,
    notify,
    onImportZip,
    setStateSafe,
    t,
  ]);

  const cancelScan = useCallback(() => {
    cancelLocalSyncQrScan();
  }, []);
  const resolveApproval = useCallback((approved) => {
    if (approvalTimeoutRef.current) {
      window.clearTimeout(approvalTimeoutRef.current);
      approvalTimeoutRef.current = null;
    }
    const resolve = approvalResolverRef.current;
    approvalResolverRef.current = null;
    setApprovalRequest(null);
    resolve?.(approved);
  }, []);
  const approvePeer = useCallback(
    () => resolveApproval(true),
    [resolveApproval],
  );
  const rejectPeer = useCallback(
    () => resolveApproval(false),
    [resolveApproval],
  );

  useEffect(() => {
    if (state.status !== "hosting" || !state.session?.expiresAt)
      return undefined;
    const updateRemaining = () => {
      setStateSafe((current) => {
        if (current.status !== "hosting" || !current.session?.expiresAt) {
          return current;
        }
        const remainingSeconds = Math.max(
          0,
          Math.ceil((current.session.expiresAt - Date.now()) / 1000),
        );
        return {
          ...current,
          session: { ...current.session, remainingSeconds },
        };
      });
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [setStateSafe, state.session?.expiresAt, state.status]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      approvalResolverRef.current?.(false);
      approvalResolverRef.current = null;
      if (approvalTimeoutRef.current) {
        window.clearTimeout(approvalTimeoutRef.current);
        approvalTimeoutRef.current = null;
      }
      Promise.resolve(cancelLocalSyncQrScan()).catch(
        ignoredError("localSync.cancelQrScan"),
      );
      hostSessionRef.current
        ?.stop()
        .catch(ignoredError("localSync.stopSession"));
      hostSessionRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (observedProjectIdRef.current === activeProjectId) return;
    observedProjectIdRef.current = activeProjectId;
    operationGenerationRef.current += 1;
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = null;
    if (approvalTimeoutRef.current) {
      window.clearTimeout(approvalTimeoutRef.current);
      approvalTimeoutRef.current = null;
    }
    setApprovalRequest(null);
    const activeSession = hostSessionRef.current;
    hostSessionRef.current = null;
    Promise.resolve(cancelLocalSyncQrScan()).catch(
      ignoredError("localSync.cancelQrScan"),
    );
    activeSession?.stop().catch(ignoredError("localSync.stopSession"));
    setStateSafe(IDLE_STATE);
  }, [activeProjectId, setStateSafe]);
  return {
    available,
    state,
    startHost,
    stopHost,
    joinHost,
    scanAndConnect,
    cancelScan,
    allowMultipleImports,
    setAllowMultipleImports,
    approvalRequest,
    approvePeer,
    rejectPeer,
  };
}
