import { useCallback, useState } from "react";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import { useRoundPermissions } from "./useAllowNewRounds";
import { useRoundStartGuard } from "./useRoundStartGuard";

/**
 * Проверка вне экрана обхода — свайп, карта, «Проверить» у выбранных —
 * ведёт себя как осмотр мониторинга: без идущего обхода сначала спрашивает,
 * начинать ли новый, при выключенных в настройках новых обходах
 * предупреждает, а при незавершённом обходе другого модуля говорит об этом
 * (см. roundConflict). Только идущий обход пускает к проверке сразу: иначе
 * она проходила бы вне всякого обхода и никуда не засчитывалась.
 *
 * @template T
 * @param {{
 *   projectId: string|null,
 *   kind: "repairs"|"reconcile",
 *   store: { read: (projectId: string|null) => any, start: (projectId: string|null) => any },
 *   texts: { disabled: string, title: string, description: string, confirm: string },
 *   notify: (notice: { type: string, message: string }) => void,
 *   onReady: (payload: T) => void,
 * }} options
 * @returns {{ request: (payload: T) => void, element: import("react").ReactNode }}
 */
export function useRoundStartGate({
  projectId,
  kind,
  store,
  texts,
  notify,
  onReady,
}) {
  const [allowed] = useRoundPermissions(projectId, kind);
  // Сверка в правило «один обход за раз» не входит — ей мешать некому.
  const blocked = useRoundStartGuard(projectId, kind, notify);
  const [pending, setPending] = useState(
    /** @type {{ payload: T }|null} */ (null),
  );

  const request = useCallback(
    (payload) => {
      const round = store.read(projectId);
      if (round && !round.completedAt) return onReady(payload);
      if (!allowed.allowNew) {
        return notify({ type: "warning", message: texts.disabled });
      }
      if (kind === "repairs" && blocked()) return undefined;
      setPending({ payload });
      return undefined;
    },
    [allowed.allowNew, blocked, kind, notify, onReady, projectId, store, texts],
  );

  const element = (
    <ConfirmSheet
      open={pending != null}
      title={texts.title}
      description={texts.description}
      confirmLabel={texts.confirm}
      onConfirm={() => {
        const next = pending;
        setPending(null);
        if (!next) return;
        if (kind === "repairs" && blocked()) return;
        store.start(projectId);
        onReady(next.payload);
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { request, element };
}
