import { useRef } from "react";

export function useSwipeActions({
  onSwipeLeft,
  onSwipeRight,
  onSwipeMove,
  threshold = 60,
}) {
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isSwipingRef = useRef(false);
  const isMouseRef = useRef(false);

  /* ================= TOUCH ================= */

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    isSwipingRef.current = true;
    isMouseRef.current = false;
  };

  const onTouchMove = (e) => {
    if (!isSwipingRef.current || isMouseRef.current) return;

    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  };

  const onTouchEnd = (e) => {
    if (!isSwipingRef.current || isMouseRef.current) return;

    const t = e.changedTouches[0];
    handleEnd(t.clientX);
  };

  /* ================= MOUSE ================= */

  const onMouseDown = (e) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isSwipingRef.current = true;
    isMouseRef.current = true;
  };

  const onMouseMove = (e) => {
    if (!isSwipingRef.current || !isMouseRef.current) return;
    handleMove(e.clientX, e.clientY);
  };

  const onMouseUp = (e) => {
    if (!isSwipingRef.current || !isMouseRef.current) return;
    handleEnd(e.clientX);
  };

  /* ================= CORE LOGIC ================= */

  const handleMove = (x, y) => {
    const dx = x - startXRef.current;
    const dy = y - startYRef.current;

    // допускаем вертикальный шум
    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      isSwipingRef.current = false;
      return;
    }

    // вызываем callback с текущим offset для анимации
    onSwipeMove?.(dx);
  };

  const handleEnd = (x) => {
    const dx = x - startXRef.current;

    if (dx > threshold) {
      onSwipeRight?.();
    } else if (dx < -threshold) {
      onSwipeLeft?.();
    }

    // сбрасываем offset после завершения свайпа
    onSwipeMove?.(0);
    isSwipingRef.current = false;
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
