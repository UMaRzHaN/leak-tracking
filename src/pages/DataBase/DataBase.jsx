import Notification from "@/components/ui/Notification/Notification";
import FilterBar from "./components/FilterBar";
import ResultsBar from "./components/ResultsBar";
import LeakList from "./components/LeakList";
import LeakModals from "./components/LeakModals";
import { useDataBaseController } from "./hooks/useDataBaseController";
import s from "./DataBase.module.scss";

export default function DataBase({ data, setData, coords }) {
  const {
    notification,
    clearNotification,
    bulkPickerOpen,
    openBulkPicker,
    closeBulkPicker,
    handleBulkPickerSelect,
    filters,
    actions,
    bulk,
    handleExport,
  } = useDataBaseController({
    data,
    setData,
    coords,
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
        nearbyFilter={filters.nearbyFilter}
        setNearbyFilter={filters.setNearbyFilter}
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
        onOpenBulkPicker={openBulkPicker}
        onExport={handleExport}
      />

      <LeakList
        items={filters.displayed}
        search={filters.search}
        statusFilter={filters.statusFilter}
        selectedIds={bulk.selectedIds}
        onOpenDetails={actions.setActiveLeak}
        onPickStatus={actions.handlePickStatus}
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
        resolveQueue={bulk.resolveQueue}
        resolveTotal={bulk.resolveTotal}
        onSequentialResolveConfirm={bulk.handleSequentialResolveConfirm}
        onCancelBulkResolve={bulk.cancelBulkResolve}
        bulkPickerOpen={bulkPickerOpen}
        onBulkStatusSelect={handleBulkPickerSelect}
        onCloseBulkPicker={closeBulkPicker}
      />
    </div>
  );
}
