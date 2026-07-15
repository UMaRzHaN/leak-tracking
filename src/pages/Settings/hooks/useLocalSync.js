import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelLocalSyncQrScan,
  createLocalSyncQrSvg,
  exchangeLocalSyncArchive,
  isLocalSyncAvailable,
  scanLocalSyncQr,
  startLocalSyncHost,
} from "@/services/localSyncService";

const IDLE_STATE = { status: "idle", session: null };

function projectKey(project) {
  return `${project?.type ?? "unknown"}:${project?.name?.trim().toLowerCase() ?? ""}`;
}

export function useLocalSync({
  activeProject,
  data,
  idbGetPhoto,
  vars,
  onImportIntoExisting,
  notify,
  lang,
  ensureProjectSyncId,
}) {
  const [state, setState] = useState(IDLE_STATE);
  const hostSessionRef = useRef(null);
  const available = useMemo(() => isLocalSyncAvailable(), []);

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
    setState(IDLE_STATE);
  }, []);

  const startHost = useCallback(async () => {
    setState({ status: "preparing", session: null });
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
          setState((current) => ({ ...current, status: "merging" }));
          const activeSession = hostSessionRef.current;
          hostSessionRef.current = null;
          try {
            await mergeArchive(file, syncProject);
            setState({ status: "complete", session: null });
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
            `${lang === "ru" ? "Ошибка локальной синхронизации" : "Local sync error"}: ${error.message}`,
          );
          setState(IDLE_STATE);
        },
      });
      hostSessionRef.current = session;
      const qrSvg = await createLocalSyncQrSvg(session, identity);
      setState({ status: "hosting", session: { ...session, qrSvg } });
    } catch (error) {
      const activeSession = hostSessionRef.current;
      hostSessionRef.current = null;
      await activeSession?.stop().catch(() => {});
      setState(IDLE_STATE);
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
  ]);

  const joinHost = useCallback(
    async ({ host, port, code }) => {
      setState({ status: "joining", session: null });
      try {
        const archive = await buildArchive();
        const incoming = await exchangeLocalSyncArchive({
          host,
          port,
          code,
          archive,
          projectKey: projectKey(activeProject),
          syncId: activeProject?.syncId ?? "",
        });
        setState({ status: "merging", session: null });
        await mergeArchive(incoming);
        setState({ status: "complete", session: null });
      } catch (error) {
        setState(IDLE_STATE);
        notify(
          "error",
          `${lang === "ru" ? "Ошибка подключения" : "Connection error"}: ${error.message}`,
        );
      }
    },
    [activeProject, buildArchive, lang, mergeArchive, notify],
  );

  const scanAndJoin = useCallback(async () => {
    setState({ status: "scanning", session: null });
    try {
      const connection = await scanLocalSyncQr({
        projectKey: projectKey(activeProject),
        syncId: activeProject?.syncId,
      });
      await joinHost(connection);
    } catch (error) {
      setState(IDLE_STATE);
      if (error.code === "QR_SCAN_CANCELLED") return;
      notify(
        "error",
        `${lang === "ru" ? "Ошибка QR-кода" : "QR code error"}: ${error.message}`,
      );
    }
  }, [activeProject, joinHost, lang, notify]);

  const cancelScan = useCallback(() => {
    cancelLocalSyncQrScan();
  }, []);

  useEffect(
    () => () => {
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
    cancelScan,
  };
}
