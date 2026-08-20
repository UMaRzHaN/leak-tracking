import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import FilterBar from "@/pages/DataBase/components/FilterBar";
import MonitoringListItem from "../MonitoringListItem";

import s from "../Monitoring.module.scss";
import { MONITORING_FILTER as FILTERS } from "@/domain/leakFilters";

export default function MonitoringLeakList({
  counts,
  filters,
  hasMonitoringRound,
  hasActiveMonitoringRound,
  items,
  lang,
  listHeight,
  listRef,
  monitoringFilter,
  monitoringRoundId,
  monitoringRoundNumber,
  onMonitor,
  onOpenDetails,
  onPickStatus,
  setMonitoringFilter,
  texts,
}) {
  const activeFilter = hasMonitoringRound ? monitoringFilter : FILTERS.ALL;

  return (
    <>
      <div className={s.sharedFilterBar}>
        <FilterBar
          search={filters.search}
          setSearch={filters.setSearch}
          statusFilter={filters.statusFilter}
          setFilter={filters.setFilter}
          priorityFilter={filters.priorityFilter}
          setPriorityFilter={filters.setPriorityFilter}
          nearbyFilter={filters.nearbyFilter}
          setNearbyFilter={filters.setNearbyFilter}
          nearbyRadius={filters.nearbyRadius}
          setNearbyRadius={filters.setNearbyRadius}
          nearbyRadiusOptions={filters.nearbyRadiusOptions}
          counts={filters.counts}
          hasGps={filters.hasGps}
        />
      </div>

      <div className={s.filters}>
        {[
          [FILTERS.DUE, texts.due, counts.due],
          [FILTERS.CHECKED, texts.checked, counts.checked],
          [FILTERS.ALL, texts.allTags, counts.all],
        ].map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={`${s.filterBtn} ${activeFilter === id ? s.filterBtnActive : ""}`}
            aria-label={`${label} ${count}`}
            aria-pressed={activeFilter === id}
            onClick={() => setMonitoringFilter(id)}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>

      <section ref={listRef} className={s.list}>
        {items.length === 0 ? (
          <div className={s.empty}>
            {filters.search ? texts.searchEmpty : texts.empty}
          </div>
        ) : (
          <VirtualizedLeakList
            items={items}
            height={listHeight}
            bottomPadding={88}
            renderItem={(leak) => (
              <MonitoringListItem
                leak={leak}
                lang={lang}
                texts={texts}
                roundId={monitoringRoundId}
                roundNumber={monitoringRoundNumber}
                hasActiveRound={hasActiveMonitoringRound}
                onOpenDetails={onOpenDetails}
                onPickStatus={onPickStatus}
                onMonitor={onMonitor}
              />
            )}
          />
        )}
      </section>
    </>
  );
}
