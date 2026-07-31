import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelLocalSyncQrScan,
  createLocalSyncQrSvg,
  exchangeLocalSyncArchive,
  fetchLocalSyncArchive,
  isLocalSyncAvailable,
  scanLocalSyncQr,
  startLocalSyncHost,
} from "@/services/localSyncService";

const IDLE_STATE = { status: "idle", session: null };

function projectKey(project) {
  return `${project?.type ?? "unknown"}:${project?.name?.trim().toLowerCase() ?? ""}`;
}

function typeLabel(type, lang) {
  const labels = {
    upstream: lang === "ru" ? "Добыча" : "Upstream",
    midstream: lang === "ru" ? "Транспортировка" : "Midstream",
    downstream: lang === "ru" ? "Переработка" : "Downstream",
  };
  return labels[type] ?? type ?? (lang === "ru" ? "неизвестно" : "unknown");
}

function syncErrorMessage(error, lang) {
  if (error?.code === "SYNC_EPOCH_MISMATCH") {
    return lang === "ru"
      ? "На одном из устройств была очищена старая история удалений. Автоматическое объединение остановлено, чтобы не восстановить удалённые записи. Создайте полный ZIP на актуальном устройстве и замените проект на втором устройстве."
      : "Old deletion history was compacted on one device. Automatic merge was stopped to prevent deleted records from being restored. Export a full ZIP from the current device and replace the project on the other device.";
  }
  if (error?.code === "PROJECT_TYPE_MISMATCH") {
    const current = typeLabel(error.existingProjectType, lang);
    const incoming = typeLabel(error.incomingProjectType, lang);
    return lang === "ru"
      ? `Нельзя синхронизировать проекты разных типов: текущий — ${current}, полученный — ${incoming}.`
      : `Projects of different types cannot be synchronized: current — ${current}, received — ${incoming}.`;
  }
  if (error?.code === "PROJECT_TYPE_MISSING") {
    return lang === "ru"
      ? "Полученный архив не содержит тип проекта. Синхронизация отменена."
      : "The received archive does not contain a project type. Synchronization was cancelled.";
  }
  if (error?.code === "CURRENT_PROJECT_TYPE_MISSING") {
    return lang === "ru"
      ? "У текущего проекта не определён тип. Синхронизация отменена."
      : "The current project has no defined type. Synchronization was cancelled.";
  }
  return error.message;
}

function isStructuredSyncError(error) {
  return (
    error?.code === "SYNC_EPOCH_MISMATCH" ||
    error?.code?.includes("PROJECT_TYPE")
  );
}

export function useLocalSync({
  activeProject,
  data,
  idbGetPhoto,
  vars,
  onImportZip,
  onImportIntoExisting,
  notify,
  lang,
  ensureProjectSyncId,
}) {
  const [state, setState] = useState(IDLE_STATE);
  const hostSessionRef = useRef(null);
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
        throw new Error(
          lang === "ru" ? "Проект не выбран" : "No project selected",
        );
      }
      const { streamProjectBackupZip } =
        await import("@/services/projectBackupService");
      return streamProjectBackupZip({
        leaks: data,
        idbGet: idbGetPhoto,
        project,
        vars,
        writeChunk,
      });
    },
    [activeProject, data, idbGetPhoto, lang, vars],
  );

  const mergeArchive = useCallback(
    async (file, targetProject = activeProject) => {
      const result = await onImportIntoExisting(file, targetProject, "sync");
      notify(
        "success",
        lang === "ru"
          ? `Синхронизация завершена: применено изменений — ${result.leakCount}`
          : `Sync complete: ${result.leakCount} changes applied`,
      );
      return result;
    },
    [activeProject, lang, notify, onImportIntoExisting],
  );

  const stopHost = useCallback(async () => {
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
        throw new Error("Не удалось создать идентификатор синхронизации");
      }
      const identity = {
        projectKey: projectKey(syncProject),
        syncId: syncProject.syncId,
      };
      const session = await startLocalSyncHost({
        produceArchive: (writeChunk) => streamArchive(writeChunk, syncProject),
        ...identity,
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
            await activeSession?.stop().catch(() => {});
          }
        },
        onError: (error) => {
          if (!isProjectOperationCurrent(operation)) return;
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          activeSession?.stop().catch(() => {});
          notify(
            "error",
            isStructuredSyncError(error)
              ? syncErrorMessage(error, lang)
              : `${lang === "ru" ? "Ошибка локальной синхронизации" : "Local sync error"}: ${error.message}`,
          );
          setStateSafe(IDLE_STATE);
        },
      });
      if (!isProjectOperationCurrent(operation)) {
        await session.stop().catch(() => {});
        return;
      }
      hostSessionRef.current = session;
      const qrSvg = await createLocalSyncQrSvg(session, identity);
      if (!isProjectOperationCurrent(operation)) {
        if (hostSessionRef.current === session) {
          hostSessionRef.current = null;
          await session.stop().catch(() => {});
        }
        return;
      }
      setStateSafe({ status: "hosting", session: { ...session, qrSvg } });
    } catch (error) {
      if (!isProjectOperationCurrent(operation)) return;
      const activeSession = hostSessionRef.current;
      hostSessionRef.current = null;
      await activeSession?.stop().catch(() => {});
      setStateSafe(IDLE_STATE);
      notify(
        "error",
        `${lang === "ru" ? "Не удалось создать сеанс" : "Could not create session"}: ${error.message}`,
      );
    }
  }, [
    activeProject,
    beginProjectOperation,
    streamArchive,
    ensureProjectSyncId,
    isProjectOperationCurrent,
    lang,
    mergeArchive,
    notify,
    setStateSafe,
  ]);

  const joinHost = useCallback(
    async (
      { host, port, code, fingerprint, syncId: connectionSyncId },
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
          projectKey: projectKey(activeProject),
          syncId: activeProject?.syncId ?? connectionSyncId ?? "",
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
            ? syncErrorMessage(error, lang)
            : `${lang === "ru" ? "Ошибка подключения" : "Connection error"}: ${error.message}`,
        );
      }
    },
    [
      activeProject,
      beginProjectOperation,
      streamArchive,
      isProjectOperationCurrent,
      lang,
      mergeArchive,
      notify,
      setStateSafe,
    ],
  );

  const scanAndJoin = useCallback(async () => {
    const operation = beginProjectOperation();
    setStateSafe({ status: "scanning", session: null });
    try {
      const connection = await scanLocalSyncQr({
        projectKey: projectKey(activeProject),
        syncId: activeProject?.syncId,
      });
      if (!isProjectOperationCurrent(operation)) return;
      await joinHost(connection, operation);
    } catch (error) {
      if (!isProjectOperationCurrent(operation)) return;
      setStateSafe(IDLE_STATE);
      if (error.code === "QR_SCAN_CANCELLED") return;
      notify(
        "error",
        `${lang === "ru" ? "Ошибка QR-кода" : "QR code error"}: ${error.message}`,
      );
    }
  }, [
    activeProject,
    beginProjectOperation,
    isProjectOperationCurrent,
    joinHost,
    lang,
    notify,
    setStateSafe,
  ]);

  const scanAndImport = useCallback(async () => {
    const operation = beginProjectOperation();
    setStateSafe({ status: "scanningImport", session: null });
    try {
      const connection = await scanLocalSyncQr();
      if (!isProjectOperationCurrent(operation)) return;
      setStateSafe({ status: "importing", session: null });
      const incoming = await fetchLocalSyncArchive(connection);
      if (!isProjectOperationCurrent(operation)) return;
      const result = await onImportZip?.(incoming);
      notify(
        "success",
        lang === "ru"
          ? `База импортирована по QR: «${result?.project?.name ?? "проект"}» (${result?.leakCount ?? 0} записей)`
          : `Database imported by QR: "${result?.project?.name ?? "project"}" (${result?.leakCount ?? 0} records)`,
      );
      setStateSafe({ status: "complete", session: null });
    } catch (error) {
      if (!isProjectOperationCurrent(operation)) return;
      setStateSafe(IDLE_STATE);
      if (error.code === "QR_SCAN_CANCELLED") return;
      notify(
        "error",
        `${lang === "ru" ? "Ошибка импорта по QR" : "QR import error"}: ${error.message}`,
      );
    }
  }, [
    beginProjectOperation,
    isProjectOperationCurrent,
    lang,
    notify,
    onImportZip,
    setStateSafe,
  ]);

  const cancelScan = useCallback(() => {
    cancelLocalSyncQrScan();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      Promise.resolve(cancelLocalSyncQrScan()).catch(() => {});
      hostSessionRef.current?.stop().catch(() => {});
      hostSessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (observedProjectIdRef.current === activeProjectId) return;
    observedProjectIdRef.current = activeProjectId;
    operationGenerationRef.current += 1;
    const activeSession = hostSessionRef.current;
    hostSessionRef.current = null;
    Promise.resolve(cancelLocalSyncQrScan()).catch(() => {});
    activeSession?.stop().catch(() => {});
    setStateSafe(IDLE_STATE);
  }, [activeProjectId, setStateSafe]);

  return {
    available,
    state,
    startHost,
    stopHost,
    joinHost,
    scanAndJoin,
    scanAndImport,
    cancelScan,
  };
}
