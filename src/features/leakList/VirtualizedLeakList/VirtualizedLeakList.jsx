import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRenderMetric } from "@/utils/renderMetrics";

const ESTIMATED_HEIGHT = 120;
const OVERSCAN_PX = 300;

function lowerBound(tops, heights, boundary) {
  let low = 0;
  let high = tops.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (tops[middle] + heights[middle] < boundary) low = middle + 1;
    else high = middle;
  }
  return low;
}

export default function VirtualizedLeakList({
  items = /** @type {any[]} */ ([]),
  height = 800,
  bottomPadding = 0,
  // Пробел между карточками, в пикселях. Строки расставлены абсолютно по
  // измеренной высоте, поэтому `gap` контейнера на них не действует, а `margin`
  // карточки в измерение не входит и дал бы наложение: расстояние приходится
  // закладывать в саму раскладку.
  gap = 0,
  renderItem,
}) {
  useRenderMetric("VirtualizedLeakList");

  const observersRef = useRef(new Map());
  const rowRefsRef = useRef(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [heights, setHeights] = useState({});

  const getKey = useCallback((item, index) => item.id ?? item._id ?? index, []);

  const updateHeight = useCallback((key, nextHeight) => {
    if (!nextHeight || Number.isNaN(nextHeight)) return;
    setHeights((previous) => {
      const previousHeight = previous[key];
      if (previousHeight && Math.abs(previousHeight - nextHeight) < 1) {
        return previous;
      }
      return { ...previous, [key]: nextHeight };
    });
  }, []);

  const getRowRef = useCallback(
    (key) => {
      const cached = rowRefsRef.current.get(key);
      if (cached) return cached;

      const callback = (node) => {
        observersRef.current.get(key)?.disconnect();
        observersRef.current.delete(key);
        if (!node) {
          rowRefsRef.current.delete(key);
          return;
        }

        const measure = () =>
          updateHeight(key, node.getBoundingClientRect().height);
        measure();
        if (typeof ResizeObserver !== "undefined") {
          const observer = new ResizeObserver(measure);
          observer.observe(node);
          observersRef.current.set(key, observer);
        }
      };
      rowRefsRef.current.set(key, callback);
      return callback;
    },
    [updateHeight],
  );

  useEffect(() => {
    const observers = observersRef.current;
    const rowRefs = rowRefsRef.current;
    return () => {
      observers.forEach((observer) => observer.disconnect());
      observers.clear();
      rowRefs.clear();
    };
  }, []);

  const onScroll = useCallback((event) => {
    const next = event.currentTarget.scrollTop;
    setScrollTop((previous) =>
      Math.abs(next - previous) > 1 ? next : previous,
    );
  }, []);

  const measurements = useMemo(() => {
    const rowHeights = new Array(items.length);
    const tops = new Array(items.length);
    let total = 0;
    for (let index = 0; index < items.length; index++) {
      const key = getKey(items[index], index);
      tops[index] = total;
      rowHeights[index] = heights[key] ?? ESTIMATED_HEIGHT;
      total += rowHeights[index] + gap;
    }
    // Пробел ставится между карточками, а не после последней.
    const totalHeight = Math.max(0, total - (items.length ? gap : 0));
    return { rowHeights, tops, totalHeight: totalHeight + bottomPadding };
  }, [items, heights, getKey, bottomPadding, gap]);

  const visibleItems = useMemo(() => {
    const startBoundary = Math.max(0, scrollTop - OVERSCAN_PX);
    const endBoundary = scrollTop + height + OVERSCAN_PX;
    const startIndex = lowerBound(
      measurements.tops,
      measurements.rowHeights,
      startBoundary,
    );
    const rows = [];
    for (
      let index = startIndex;
      index < items.length && measurements.tops[index] < endBoundary;
      index++
    ) {
      rows.push({
        item: items[index],
        index,
        top: measurements.tops[index],
        key: getKey(items[index], index),
      });
    }
    return rows;
  }, [items, measurements, getKey, scrollTop, height]);

  return (
    <div
      onScroll={onScroll}
      style={{
        height,
        overflowY: "auto",
        position: "relative",
        willChange: "transform",
      }}
    >
      <div style={{ height: measurements.totalHeight, position: "relative" }}>
        {visibleItems.map(({ item, index, top, key }) => (
          <div
            key={key}
            ref={getRowRef(key)}
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
