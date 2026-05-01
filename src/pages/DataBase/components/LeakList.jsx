import { memo, useCallback } from "react";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import LeakCardCompact from "@/features/leakList/LeakCardCompact/LeakCardCompact";
import { NEARBY, NEARBY_RADIUS_M } from "@/pages/DataBase/hooks/useDataBaseFilters";
import s from "@/pages/DataBase/DataBase.module.scss";

function LeakList({ items, search, statusFilter, selectedIds, onOpenDetails, onPickStatus, onToggleSelect }) {
  const renderItem = useCallback(
    (leak) => (
      <LeakCardCompact
        leak={leak}
        onOpenDetails={onOpenDetails}
        onPickStatus={onPickStatus}
        nearbyDist={leak._nearbyDist}
        selected={selectedIds.has(leak.id)}
        onToggleSelect={onToggleSelect}
      />
    ),
    [onOpenDetails, onPickStatus, selectedIds, onToggleSelect],
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
    <div className={s.list}>
      <VirtualizedLeakList
        items={items}
        height={650}
        renderItem={renderItem}
      />
    </div>
  );
}

export default memo(LeakList);
