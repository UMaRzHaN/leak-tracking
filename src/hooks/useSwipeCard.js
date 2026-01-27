import { useState } from "react";
import { useSwipeActions } from "./useSwipeActions";

export function useSwipeCard({ onOpenDetails, leak, onRemove }) {
  const [swipeState, setSwipeState] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  // null | "left" | "right"

  const swipe = useSwipeActions({
    onSwipeMove: (offset) => {
      setSwipeOffset(offset);
    },

    // 👈 справа → налево — УДАЛЕНИЕ
    onSwipeLeft: () => {
      setSwipeState("left");

      setTimeout(() => {
        onRemove?.(leak.id);
        setSwipeState(null);
        setSwipeOffset(0);
      }, 200);
    },

    // 👉 слева → направо — DETAILS
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
