import { useCallback } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { ROUND_KIND, blockingRound } from "@/app/project/roundConflict";

// Ключи — литералами: проверка переводов ищет их в коде.
const BLOCKED_TEXT = {
  [ROUND_KIND.MONITORING]: "monitoring.roundBlockedByRepairs",
  [ROUND_KIND.REPAIRS]: "repairs.round.blockedByMonitoring",
};

/**
 * Проверка перед началом обхода `kind`: если не завершён обход другого
 * модуля, говорит об этом и отвечает `true` — начинать нельзя.
 *
 * @param {string|null} projectId
 * @param {string} kind ROUND_KIND
 * @param {(notice: { type: string, message: string }) => void} notify
 * @returns {() => boolean}
 */
export function useRoundStartGuard(projectId, kind, notify) {
  const { t } = useLanguage();
  return useCallback(() => {
    const blocking = blockingRound(projectId, kind);
    if (blocking) {
      notify({
        type: "error",
        message: t(BLOCKED_TEXT[kind], { number: blocking.number }),
      });
    }
    return Boolean(blocking);
  }, [kind, notify, projectId, t]);
}
