import { useRef } from "react";

export function useSwipeActions({
  onSwipeLeft,
  onSwipeRight,
  onSwipeMove,
  threshold = 60,
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);
  const isMouse = useRef(false);

  /* ================= TOUCH ================= */

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    isSwiping.current = true;
    isMouse.current = false;
  };

  const onTouchMove = (e) => {
    if (!isSwiping.current || isMouse.current) return;

    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  };

  const onTouchEnd = (e) => {
    if (!isSwiping.current || isMouse.current) return;

    const t = e.changedTouches[0];
    handleEnd(t.clientX);
  };

  /* ================= MOUSE ================= */

  const onMouseDown = (e) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    isSwiping.current = true;
    isMouse.current = true;
  };

  const onMouseMove = (e) => {
    if (!isSwiping.current || !isMouse.current) return;
    handleMove(e.clientX, e.clientY);
  };

  const onMouseUp = (e) => {
    if (!isSwiping.current || !isMouse.current) return;
    handleEnd(e.clientX);
  };

  /* ================= CORE LOGIC ================= */

  const handleMove = (x, y) => {
    const dx = x - startX.current;
    const dy = y - startY.current;

    // допускаем вертикальный шум
    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      isSwiping.current = false;
      return;
    }

    // вызываем callback с текущим offset для анимации
    onSwipeMove?.(dx);
  };

  const handleEnd = (x) => {
    const dx = x - startX.current;

    if (dx > threshold) {
      onSwipeRight?.();
    } else if (dx < -threshold) {
      onSwipeLeft?.();
    }

    // сбрасываем offset после завершения свайпа
    onSwipeMove?.(0);
    isSwiping.current = false;
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}
