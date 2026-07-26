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
import s from "./DataBase.module.scss";

export default function DataBase({
  data,
  setData,
  coords,
  sharedFilters,
  onMonitorLeak,
  onMonitorLeaks,
  userProfile,
}) {
  useRenderMetric("DataBase");

  const { lang } = useLanguage();
  const projectConfig = useProjectConfig();
  const [bulkCalculationOpen, setBulkCalculationOpen] = useState(false);
  const {
    notification,
    clearNotification,
    bulkPickerOpen,
    closeBulkPicker,
    handleBulkPickerSelect,
    filters,
    actions,
    bulk,
    handleExport,
    isExporting,
  } = useDataBaseController({
    data,
    setData,
    coords,
    sharedFilters,
    configuredLocationKey: projectConfig.system.location.secondary,
    userProfile,
  });

  return (
    <div className={s.page}>
      <Notification notification={notification} onClose={clearNotification} />

      <FilterBar
        search={filters.search}
        setSearch={filters.setSearch}
        statusFilter={filters.statusFilter}
        setFilter={filters.setFilter}
        priorityFilter={filters.priorityFilter}
        setPriorityFilter={filters.setPriorityFilter}
        locationFilter={filters.locationFilter}
        setLocationFilter={filters.setLocationFilter}
        locationKey={filters.locationKey}
        locationLabel={projectConfig.system.location.label}
        locationOptions={filters.locationOptions}
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
        totalCount={data.length}
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
        onExport={handleExport}
        isExporting={isExporting}
      />

      <LeakList
        items={filters.displayed}
        search={filters.search}
        statusFilter={filters.statusFilter}
        selectedIds={bulk.selectedIds}
        onOpenDetails={actions.setActiveLeak}
        onPickStatus={actions.handlePickStatus}
        onMonitor={onMonitorLeak}
        onToggleSelect={bulk.toggleSelected}
      />

      <LeakModals
        activeLeak={actions.activeLeak}
        onCloseDetails={() => actions.setActiveLeak(null)}
        onSave={actions.handleSave}
        onDelete={(id) =>
          actions.handleDelete(id, { onDeleted: bulk.deselectId })
        }
        pickerLeak={actions.pickerLeak}
        onStatusSelect={actions.handleStatusSelect}
        onClosePicker={() => actions.setPickerLeak(null)}
        resolveLeak={actions.resolveLeak}
        onResolveConfirm={actions.handleResolveConfirm}
        onCloseResolve={() => actions.setResolveLeak(null)}
        repairLeak={actions.repairLeak}
        onRepairConfirm={actions.handleRepairConfirm}
        onCloseRepair={() => actions.setRepairLeak(null)}
        reopenLeak={actions.reopenLeak}
        vars={actions.vars}
        onReopenConfirm={actions.handleReopenConfirm}
        onCloseReopen={() => actions.setReopenLeak(null)}
        resolveQueue={bulk.resolveQueue}
        resolveTotal={bulk.resolveTotal}
        onSequentialResolveConfirm={bulk.handleSequentialResolveConfirm}
        onCancelBulkResolve={bulk.cancelBulkResolve}
        repairQueue={bulk.repairQueue}
        repairTotal={bulk.repairTotal}
        onSequentialRepairConfirm={bulk.handleSequentialRepairConfirm}
        onCancelBulkRepair={bulk.cancelBulkRepair}
        bulkPickerOpen={bulkPickerOpen}
        onBulkStatusSelect={handleBulkPickerSelect}
        onCloseBulkPicker={closeBulkPicker}
        userProfile={userProfile}
      />

      <SettingsModal
        open={bulkCalculationOpen}
        onClose={() => setBulkCalculationOpen(false)}
        variables={bulk.bulkCalculationVars}
        onSave={bulk.handleBulkCalculationSave}
        title={lang === "ru" ? "Массовый пересчёт" : "Bulk recalculation"}
        description={
          lang === "ru"
            ? `Параметры первой выбранной утечки будут применены к ${bulk.selectedCount} записям.`
            : `The first selected record's parameters will be applied to ${bulk.selectedCount} records.`
        }
        saveLabel={lang === "ru" ? "Применить" : "Apply"}
        allowUnchangedSave
      />
    </div>
  );
}
