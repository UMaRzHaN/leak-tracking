import { useState } from "react";
import { useRenderMetric } from "@/utils/renderMetrics";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";
import Notification from "@/components/ui/Notification/Notification";
import SettingsModal from "@/features/settings/SettingsModal/SettingsModal";
import FilterBar from "./components/FilterBar";
import ResultsBar from "./components/ResultsBar";
import LeakList from "./components/LeakList";
import LeakModals from "./components/LeakModals";
import { useDataBaseController } from "./hooks/useDataBaseController";
import { useCanCheckRepair } from "@/pages/Repairs/useCanCheckRepair";
import s from "./DataBase.module.scss";

export default function DataBase({
  data,
  setData,
  coords,
  sharedFilters,
  onMonitorLeak,
  onMonitorLeaks,
  monitorLabel = /** @type {string|null} */ (null),
  repairMode = false,
  userProfile,
}) {
  useRenderMetric("DataBase");

  const { t } = useLanguage();
  const projectConfig = useProjectConfig();
  const [bulkCalculationOpen, setBulkCalculationOpen] = useState(false);
  const canCheckRepair = useCanCheckRepair(repairMode);
  const { notification, clearNotification, filters, actions, bulk } =
    useDataBaseController({
      data,
      setData,
      coords,
      sharedFilters,
      configuredMainLocationKey: projectConfig.system.location.main,
      configuredLocationKey: projectConfig.system.location.secondary,
      configuredLastLocationKey: projectConfig.system.location.last,
      userProfile,
    });

  return (
    <div className={s.page}>
      <Notification notification={notification} onClose={clearNotification} />

      <FilterBar
        repairMode={repairMode}
        search={filters.search}
        setSearch={filters.setSearch}
        searchScope={filters.searchScope}
        setSearchScope={filters.setSearchScope}
        statusFilter={filters.statusFilter}
        setFilter={filters.setFilter}
        priorityFilter={filters.priorityFilter}
        setPriorityFilter={filters.setPriorityFilter}
        fictionFilter={filters.fictionFilter}
        setFictionFilter={filters.setFictionFilter}
        tagFilter={filters.tagFilter}
        setTagFilter={filters.setTagFilter}
        nearbyFilter={filters.nearbyFilter}
        setNearbyFilter={filters.setNearbyFilter}
        nearbyRadius={filters.nearbyRadius}
        setNearbyRadius={filters.setNearbyRadius}
        nearbyRadiusOptions={filters.nearbyRadiusOptions}
        counts={filters.counts}
        hasGps={filters.hasGps}
      />

      <ResultsBar
        visibleCount={filters.displayed.length}
        statusFilter={filters.statusFilter}
        sortAsc={filters.sortAsc}
        onSortToggle={filters.toggleSort}
        selectedCount={bulk.selectedCount}
        allDisplayedSelected={bulk.allDisplayedSelected}
        onClearSelection={bulk.clearSelection}
        onSelectDisplayed={
          bulk.allDisplayedSelected ? bulk.clearSelection : bulk.selectDisplayed
        }
        onMonitorSelected={() => {
          const selected = filters.displayed.filter((item) =>
            bulk.selectedIds.has(item.id),
          );
          onMonitorLeaks?.(selected);
          bulk.clearSelection();
        }}
        onEditBulkCalculation={() => setBulkCalculationOpen(true)}
      />

      <LeakList
        items={filters.displayed}
        search={filters.search}
        statusFilter={filters.statusFilter}
        selectedIds={bulk.selectedIds}
        onOpenDetails={actions.setActiveLeak}
        onMonitor={onMonitorLeak}
        canMonitor={canCheckRepair}
        monitorLabel={monitorLabel}
        onToggleSelect={bulk.toggleSelected}
      />

      <LeakModals
        activeLeak={actions.activeLeak}
        allLeaks={data}
        onCloseDetails={() => actions.setActiveLeak(null)}
        onSave={actions.handleSave}
        onDelete={(id) =>
          actions.handleDelete(id, { onDeleted: bulk.deselectId })
        }
        userProfile={userProfile}
      />

      <SettingsModal
        open={bulkCalculationOpen}
        onClose={() => setBulkCalculationOpen(false)}
        variables={bulk.bulkCalculationVars}
        onSave={bulk.handleBulkCalculationSave}
        title={t("database.bulkRecalcTitle")}
        description={t("database.bulkRecalcDescription", {
          count: bulk.selectedCount,
        })}
        saveLabel={t("database.apply")}
        allowUnchangedSave
      />
    </div>
  );
}
