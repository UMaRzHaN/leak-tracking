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
  const available = useMemo(() => isLocalSyncAvailable(), []);

  // Guards every setState below: once unmounted, in-flight sync/import
  // callbacks (host archive received, QR scan resolved, etc.) can still
  // finish their real work, but must stop touching component state.
  const setStateSafe = useCallback((next) => {
    if (!mountedRef.current) return;
    setState(next);
  }, []);

  const buildArchive = useCallback(
    async (project = activeProject) => {
      if (!project) {
        throw new Error(
          lang === "ru" ? "Проект не выбран" : "No project selected",
        );
      }
      const { buildProjectBackupZip } =
        await import("@/services/projectBackupService");
      return buildProjectBackupZip({
        leaks: data,
        idbGet: idbGetPhoto,
        project,
        vars,
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
      const archive = await buildArchive(syncProject);
      const session = await startLocalSyncHost({
        archive,
        ...identity,
        onArchive: async (file) => {
          setStateSafe((current) => ({ ...current, status: "merging" }));
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          try {
            await mergeArchive(file, syncProject);
            setStateSafe({ status: "complete", session: null });
          } finally {
            await activeSession?.stop().catch(() => {});
          }
        },
        onError: (error) => {
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          activeSession?.stop().catch(() => {});
          notify(
            "error",
            error?.code?.includes("PROJECT_TYPE")
              ? syncErrorMessage(error, lang)
              : `${lang === "ru" ? "Ошибка локальной синхронизации" : "Local sync error"}: ${error.message}`,
          );
          setStateSafe(IDLE_STATE);
        },
      });
      hostSessionRef.current = session;
      const qrSvg = await createLocalSyncQrSvg(session, identity);
      setStateSafe({ status: "hosting", session: { ...session, qrSvg } });
    } catch (error) {
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
    buildArchive,
    ensureProjectSyncId,
    lang,
    mergeArchive,
    notify,
    setStateSafe,
  ]);

  const joinHost = useCallback(
    async ({ host, port, code, fingerprint }) => {
      setStateSafe({ status: "joining", session: null });
      try {
        const archive = await buildArchive();
        const incoming = await exchangeLocalSyncArchive({
          host,
          port,
          code,
          fingerprint,
          archive,
          projectKey: projectKey(activeProject),
          syncId: activeProject?.syncId ?? "",
        });
        setStateSafe({ status: "merging", session: null });
        await mergeArchive(incoming);
        setStateSafe({ status: "complete", session: null });
      } catch (error) {
        setStateSafe(IDLE_STATE);
        notify(
          "error",
          error?.code?.includes("PROJECT_TYPE")
            ? syncErrorMessage(error, lang)
            : `${lang === "ru" ? "Ошибка подключения" : "Connection error"}: ${error.message}`,
        );
      }
    },
    [activeProject, buildArchive, lang, mergeArchive, notify, setStateSafe],
  );

  const scanAndJoin = useCallback(async () => {
    setStateSafe({ status: "scanning", session: null });
    try {
      const connection = await scanLocalSyncQr({
        projectKey: projectKey(activeProject),
        syncId: activeProject?.syncId,
      });
      await joinHost(connection);
    } catch (error) {
      setStateSafe(IDLE_STATE);
      if (error.code === "QR_SCAN_CANCELLED") return;
      notify(
        "error",
        `${lang === "ru" ? "Ошибка QR-кода" : "QR code error"}: ${error.message}`,
      );
    }
  }, [activeProject, joinHost, lang, notify, setStateSafe]);

  const scanAndImport = useCallback(async () => {
    setStateSafe({ status: "scanningImport", session: null });
    try {
      const connection = await scanLocalSyncQr();
      setStateSafe({ status: "importing", session: null });
      const incoming = await fetchLocalSyncArchive(connection);
      const result = await onImportZip?.(incoming);
      notify(
        "success",
        lang === "ru"
          ? `База импортирована по QR: «${result?.project?.name ?? "проект"}» (${result?.leakCount ?? 0} записей)`
          : `Database imported by QR: "${result?.project?.name ?? "project"}" (${result?.leakCount ?? 0} records)`,
      );
      setStateSafe({ status: "complete", session: null });
    } catch (error) {
      setStateSafe(IDLE_STATE);
      if (error.code === "QR_SCAN_CANCELLED") return;
      notify(
        "error",
        `${lang === "ru" ? "Ошибка импорта по QR" : "QR import error"}: ${error.message}`,
      );
    }
  }, [lang, notify, onImportZip, setStateSafe]);

  const cancelScan = useCallback(() => {
    cancelLocalSyncQrScan();
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      Promise.resolve(cancelLocalSyncQrScan()).catch(() => {});
      hostSessionRef.current?.stop().catch(() => {});
      hostSessionRef.current = null;
    },
    [],
  );

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
