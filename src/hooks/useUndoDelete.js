import { useState, useCallback, useRef } from "react";

/**
 * Undo-удаление с таймаутом.
 * Хранит удалённый элемент; если пользователь не отменил — вызывает onConfirm.
 *
 * Usage:
 *   const { pending, schedule, undo } = useUndoDelete({ onConfirm, delayMs });
 */
export function useUndoDelete({ onConfirm, delayMs = 4000 } = {}) {
  const [pending, setPending] = useState(null); // { id, label }
  const timerRef = useRef(null);

  const schedule = useCallback(
    (item) => {
      // Если уже есть ожидающее — сразу подтверждаем его
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        onConfirm?.(pending);
      }

      setPending(item);

      timerRef.current = setTimeout(() => {
        onConfirm?.(item);
        setPending(null);
        timerRef.current = null;
      }, delayMs);
    },
    [pending, onConfirm, delayMs],
  );

  const undo = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPending(null);
  }, []);

  const flush = useCallback(() => {
    if (pending && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onConfirm?.(pending);
      setPending(null);
    }
  }, [pending, onConfirm]);

  return { pending, schedule, undo, flush };
}
