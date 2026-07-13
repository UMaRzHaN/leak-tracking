import { memo, useCallback, useEffect, useRef, useState } from "react";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import {
  NEARBY,
  NEARBY_RADIUS_M,
} from "@/pages/DataBase/hooks/useDataBaseFilters";
import s from "@/pages/DataBase/DataBase.module.scss";

function LeakList({
  items,
  search,
  statusFilter,
  selectedIds,
  onOpenDetails,
  onPickStatus,
  onMonitor,
  onToggleSelect,
}) {
  const listRef = useRef(null);
  const [listHeight, setListHeight] = useState(420);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;

    const updateListHeight = () => {
      setListHeight(Math.max(1, Math.floor(node.clientHeight)));
    };
    updateListHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateListHeight);
      return () => window.removeEventListener("resize", updateListHeight);
    }

    const observer = new ResizeObserver(updateListHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length]);

  const renderItem = useCallback(
    (leak) => (
      <LeakCardCompact
        leak={leak}
        onOpenDetails={onOpenDetails}
        onPickStatus={onPickStatus}
        onMonitor={onMonitor}
        nearbyDist={leak._nearbyDist}
        selected={selectedIds.has(leak.id)}
        onToggleSelect={onToggleSelect}
      />
    ),
    [onMonitor, onOpenDetails, onPickStatus, selectedIds, onToggleSelect],
  );

  if (!items.length) {
    return (
      <div className={s.empty}>
        <span>📭</span>
        <p>
          {search
            ? "Ничего не найдено"
            : statusFilter === NEARBY
              ? `Нет утечек в радиусе ${NEARBY_RADIUS_M} м`
              : "Записей нет"}
        </p>
      </div>
    );
  }

  return (
    <div ref={listRef} className={s.list}>
      <VirtualizedLeakList
        items={items}
        height={listHeight}
        bottomPadding={88}
        renderItem={renderItem}
      />
    </div>
  );
}

export default memo(LeakList);
