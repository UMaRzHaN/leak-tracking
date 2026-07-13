import { useRef, useState, useEffect, useMemo, useCallback } from "react";

export default function VirtualizedLeakList({
  items = [],
  height = 800,
  bottomPadding = 0,
  renderItem,
}) {
  const containerRef = useRef(null);
  const observersRef = useRef(new Map());

  const [scrollTop, setScrollTop] = useState(0);
  const [heights, setHeights] = useState({});

  const estimatedHeight = 120;
  const overscanPx = 300;

  const getKey = useCallback((item, index) => item.id ?? item._id ?? index, []);

  const updateHeight = useCallback((key, nextHeight) => {
    if (!nextHeight || Number.isNaN(nextHeight)) return;

    setHeights((prev) => {
      const prevHeight = prev[key];
      if (prevHeight && Math.abs(prevHeight - nextHeight) < 1) return prev;
      return {
        ...prev,
        [key]: nextHeight,
      };
    });
  }, []);

  const registerRow = useCallback(
    (key) => (node) => {
      const prevObserver = observersRef.current.get(key);
      if (prevObserver) {
        prevObserver.disconnect();
        observersRef.current.delete(key);
      }

      if (!node) return;

      const measure = () => {
        const rect = node.getBoundingClientRect();
        updateHeight(key, rect.height);
      };

      measure();

      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          measure();
        });
        ro.observe(node);
        observersRef.current.set(key, ro);
      }
    },
    [updateHeight],
  );

  useEffect(() => {
    const observers = observersRef.current;

    return () => {
      observers.forEach((ro) => ro.disconnect());
      observers.clear();
    };
  }, []);

  const onScroll = useCallback((e) => {
    const next = e.currentTarget.scrollTop;
    setScrollTop((prev) => (Math.abs(next - prev) > 1 ? next : prev));
  }, []);

  const layout = useMemo(() => {
    const rowHeights = items.map((item, index) => {
      const key = getKey(item, index);
      return heights[key] ?? estimatedHeight;
    });

    const tops = [];
    let acc = 0;

    for (let i = 0; i < rowHeights.length; i++) {
      tops.push(acc);
      acc += rowHeights[i];
    }

    const totalHeight = acc + bottomPadding;
    const viewportBottom = scrollTop + height;
    const startBoundary = Math.max(0, scrollTop - overscanPx);
    const endBoundary = viewportBottom + overscanPx;

    let startIndex = 0;
    while (
      startIndex < items.length &&
      tops[startIndex] + rowHeights[startIndex] < startBoundary
    ) {
      startIndex++;
    }

    let endIndex = startIndex;
    while (endIndex < items.length && tops[endIndex] < endBoundary) {
      endIndex++;
    }

    const visibleItems = [];
    for (let i = startIndex; i < endIndex; i++) {
      visibleItems.push({
        item: items[i],
        index: i,
        top: tops[i],
        height: rowHeights[i],
        key: getKey(items[i], i),
      });
    }

    return {
      totalHeight,
      visibleItems,
    };
  }, [items, heights, getKey, scrollTop, height, bottomPadding]);

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
      <div
        style={{
          height: layout.totalHeight,
          position: "relative",
        }}
      >
        {layout.visibleItems.map(({ item, index, top, key }) => (
          <div
            key={key}
            ref={registerRow(key)}
            style={{
              position: "absolute",
              top,
              left: 0,
              right: 0,
              boxSizing: "border-box",
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
