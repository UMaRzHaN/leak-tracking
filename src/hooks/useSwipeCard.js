import { useState } from "react";
import { useSwipeActions } from "./useSwipeActions";

export function useSwipeCard({ onOpenDetails, leak, onPickStatus }) {
  const [swipeState, setSwipeState]   = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const swipe = useSwipeActions({
    onSwipeMove: (offset) => setSwipeOffset(offset),

    // 👈 справа → налево — открыть выбор статуса
    onSwipeLeft: () => {
      setSwipeState("left");
      setTimeout(() => {
        onPickStatus?.(leak);
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
      onTouchMove:  swipe.onTouchMove,
      onTouchEnd:   swipe.onTouchEnd,
      onMouseDown:  swipe.onMouseDown,
      onMouseMove:  swipe.onMouseMove,
      onMouseUp:    swipe.onMouseUp,
    },
  };
}
