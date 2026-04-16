import { useRef, useState, useEffect, useMemo } from "react";

export default function VirtualizedLeakList({
  items = [],
  height = 800,
  renderItem,
}) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [itemHeight, setItemHeight] = useState(120);

  const itemHeightRef = useRef(120);

  /* ======================================================
     MEASURE ITEM HEIGHT (1 раз на изменение items)
     ====================================================== */
  useEffect(() => {
    if (!measureRef.current) return;

    const h = measureRef.current.offsetHeight;

    if (h && h !== itemHeightRef.current) {
      itemHeightRef.current = h;
      setItemHeight(h);
    }
  }, [items]);

  /* ======================================================
     SCROLL HANDLER (без лишних setState)
     ====================================================== */
  const onScroll = (e) => {
    const next = e.currentTarget.scrollTop;

    // обновляем только если реально изменилось
    if (Math.abs(next - scrollTop) > 1) {
      setScrollTop(next);
    }
  };

  /* ======================================================
     CALCULATIONS
     ====================================================== */
  const totalHeight = items.length * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  const visibleCount = Math.ceil(height / itemHeight) + 6;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex],
  );

  const offsetY = startIndex * itemHeight;

  /* ======================================================
     RENDER
     ====================================================== */
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        height,
        overflowY: "auto",
        position: "relative",
        willChange: "transform",
      }}
    >
      {/* скрытый измеритель */}
      {items.length > 0 && (
        <div
          ref={measureRef}
          style={{
            position: "absolute",
            visibility: "hidden",
            pointerEvents: "none",
            zIndex: -1,
          }}
        >
          {renderItem(items[0], 0)}
        </div>
      )}

      <div
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
          }}
        >
          {visibleItems.map((item, i) => (
            <div
              key={item.id ?? i}
              style={{
                height: itemHeight,
                boxSizing: "border-box",
                paddingBottom: 8,
              }}
            >
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}