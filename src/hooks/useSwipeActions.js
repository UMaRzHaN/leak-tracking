import { useRef } from "react";

export function useSwipeActions(threshold = 60) {
  const startX = useRef(0);
  const deltaX = useRef(0);

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
  };

  const onTouchMove = (e) => {
    deltaX.current = e.touches[0].clientX - startX.current;
  };

  const onTouchEnd = (setOpen) => {
    if (deltaX.current < -threshold) {
      setOpen(true);
    } else {
      setOpen(false);
    }
    deltaX.current = 0;
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
