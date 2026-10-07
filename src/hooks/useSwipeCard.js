import { useState } from "react";
import { useSwipeActions } from "./useSwipeActions";

export function useSwipeCard({
  onOpenDetails,
  leak,
  onMonitor = /** @type {((leak: any) => void)|null} */ (null),
}) {
  const [swipeState, setSwipeState] = useState(
    /** @type {"left"|"right"|null} */ (null),
  );
  const [swipeOffset, setSwipeOffset] = useState(0);

  const swipe = useSwipeActions({
    // Влево карточка уходит, только когда там есть проверка: без неё свайп
    // влево ничего не делает и карточку не сдвигает.
    onSwipeMove: (offset) =>
      setSwipeOffset(onMonitor ? offset : Math.max(0, offset)),

    // 👈 справа → налево — проверка (мониторинг или ремонт)
    onSwipeLeft: () => {
      if (!onMonitor) return;
      setSwipeState("left");
      setTimeout(() => {
        onMonitor(leak);
        setSwipeState(null);
        setSwipeOffset(0);
      }, 200);
    },

    // 👉 слева → направо — ОТКРЫТЬ ДЕТАЛИ
    onSwipeRight: () => {
      setSwipeState("right");
      setTimeout(() => {
        onOpenDetails?.(leak);
        setSwipeState(null);
        setSwipeOffset(0);
      }, 200);
    },
  });

  const close = () => {
    setSwipeState(null);
    setSwipeOffset(0);
  };

  return {
    swipeState,
    swipeOffset,
    close,
    handlers: {
      onTouchStart: swipe.onTouchStart,
      onTouchMove: swipe.onTouchMove,
      onTouchEnd: swipe.onTouchEnd,
      onMouseDown: swipe.onMouseDown,
      onMouseMove: swipe.onMouseMove,
      onMouseUp: swipe.onMouseUp,
    },
  };
}
