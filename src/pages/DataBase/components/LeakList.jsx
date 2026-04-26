import VirtualizedLeakList from "../../../components/VirtualizedLeakList/VirtualizedLeakList";
import LeakCardCompact from "../../../components/LeakCardCompact/LeakCardCompact";
import { NEARBY, NEARBY_RADIUS_M } from "../hooks/useDataBaseFilters";
import s from "../DataBase.module.scss";

export default function LeakList({ items, search, statusFilter, selectedIds, onOpenDetails, onPickStatus, onToggleSelect }) {
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
        renderItem={(leak) => (
          <LeakCardCompact
            key={leak.id}
            leak={leak}
            onOpenDetails={onOpenDetails}
            onPickStatus={onPickStatus}
            nearbyDist={leak._nearbyDist}
            selected={selectedIds.has(leak.id)}
            onToggleSelect={() => onToggleSelect(leak.id)}
          />
        )}
      />
    </div>
  );
}
