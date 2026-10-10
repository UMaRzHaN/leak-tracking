import { useCallback, useEffect, useState } from "react";
import { isValidInvoice } from "@/domain/equipmentAcceptance";
import { globalScope } from "@/utils/globalScope";

/**
 * Накладные приёмки — небольшой JSON проекта, как обход мониторинга: лежат в
 * localStorage по проекту и уходят в project.json бэкапа. Фото у приёмки нет,
 * поэтому отдельное хранилище с файлами ей не нужно.
 */
const EVENT = "acceptances-updated";

export const acceptanceStorageKey = (projectId) =>
  projectId ? `app:${projectId}:acceptances_v1` : null;

export function readAcceptances(projectId) {
  const key = acceptanceStorageKey(projectId);
  if (!key) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter(isValidInvoice) : [];
  } catch {
    return [];
  }
}

export function saveAcceptances(projectId, invoices) {
  const key = acceptanceStorageKey(projectId);
  if (!key) return;
  const valid = (Array.isArray(invoices) ? invoices : []).filter(
    isValidInvoice,
  );
  if (valid.length) localStorage.setItem(key, JSON.stringify(valid));
  else localStorage.removeItem(key);
  globalScope.dispatchEvent?.(
    new CustomEvent(EVENT, { detail: { projectId } }),
  );
}

export function useAcceptances(projectId) {
  const [invoices, setInvoices] = useState(() => readAcceptances(projectId));
  useEffect(() => {
    setInvoices(readAcceptances(projectId));
    const handle = (event) => {
      if (event.detail?.projectId === projectId) {
        setInvoices(readAcceptances(projectId));
      }
    };
    globalScope.addEventListener?.(EVENT, handle);
    return () => globalScope.removeEventListener?.(EVENT, handle);
  }, [projectId]);

  const save = useCallback(
    (next) => {
      saveAcceptances(projectId, next);
      setInvoices(readAcceptances(projectId));
    },
    [projectId],
  );
  return /** @type {[any[], (next: any[]) => void]} */ ([invoices, save]);
}
