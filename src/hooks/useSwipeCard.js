import { useState } from "react";
import { useSwipeActions } from "./useSwipeActions";

export function useSwipeCard({ onOpenDetails, leak, onRemove }) {
  const [swipeState, setSwipeState] = useState(null);
  // null | "left" | "right"

  const swipe = useSwipeActions({
    // 👈 справа → налево — УДАЛЕНИЕ
    onSwipeLeft: () => {
      setSwipeState("left");

      setTimeout(() => {
        onRemove?.(leak.id);
        setSwipeState(null);
      }, 200);
    },

    // 👉 слева → направо — DETAILS
    onSwipeRight: () => {
      setSwipeState("right");

      setTimeout(() => {
        onOpenDetails?.(leak);
        setSwipeState(null);
      }, 200);
    },
  });

  const close = () => setSwipeState(null);

  return {
    swipeState,
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
