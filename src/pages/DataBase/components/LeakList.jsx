import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";

import s from "@/pages/DataBase/DataBase.module.scss";
import { NEARBY, NEARBY_RADIUS_M } from "@/domain/leakFilters";

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
  const { t } = useTranslation();
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
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
            ? t("database.empty.nothingFound")
            : statusFilter === NEARBY
              ? t("database.empty.noNearby", { radius: NEARBY_RADIUS_M })
              : t("database.empty.noRecords")}
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
