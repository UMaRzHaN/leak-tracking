import { useState, useMemo, useCallback } from "react";
import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";
import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";
import StatusPickerModal from "../../components/StatusPickerModal/StatusPickerModal";
import ResolveModal from "../../components/ResolveModal/ResolveModal";
import VirtualizedLeakList from "../../components/VirtualizedLeakList/VirtualizedLeakList";
import Notification from "../../components/Notification/Notification";
import FilterBar from "./FilterBar";
import ResultsBar from "./ResultsBar";
import { STATUS, STATUS_META, STATUS_ORDER } from "../../utils/status";
import { hapticSuccess } from "../../utils/haptics";
import { filterNearbyLeaks } from "../../utils/geoUtils";
import { exportToExcelZip } from "../../services/export/excel";
import { useProjectData } from "../../app/hooks/useProjectData";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { usePhotoStorage } from "../../hooks/usePhotoStorage";
import s from "./DataBase.module.scss";

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const ALL = "all";
const NEARBY = "nearby";
const NEARBY_RADIUS_M = 500;

function round2(v) {
  return v != null && Number.isFinite(Number(v))
    ? Math.round(Number(v) * 100) / 100
    : v;
}

function prepareRows(data) {
  return data.map((r) => ({
    ...r,
    status: STATUS_META[r.status ?? STATUS.OPEN]?.label ?? r.status ?? "",
    date:
      r.date ??
      (r.created_at
        ? new Date(Number(r.created_at)).toLocaleDateString("ru-RU")
        : ""),
    Total_Annual_Methane_Loss_m3_y: round2(r.Total_Annual_Methane_Loss_m3_y),
    Emissions_t_CO2eq_year: round2(r.Emissions_t_CO2eq_year),
    photo: r.photo ? "Есть" : "",
    photo_after: r.photo_after ? "Есть" : "",
    resolvedAt: fmtTs(r.resolvedAt),
  }));
}

export default function DataBase({ data, setData, coords }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setFilter] = useState(ALL);
  const [notification, setNotification] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [sortAsc, setSortAsc] = useState(false);
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [resolveQueue, setResolveQueue] = useState([]);
  const [resolveTotal, setResolveTotal] = useState(0);

  const { save } = useProjectData();
  const projectConfig = useProjectConfig();
  const { headers: excelHeaders, keysOrder: excelKeys } =
    projectConfig.export.excel;
  const { getPhoto: idbGetPhoto } = usePhotoStorage();

  const hasGps = Boolean(coords?.lat && coords?.lng);

  const notify = useCallback((type, message) => {
    setNotification({ type, message });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkStatusChange = useCallback(
    async (status) => {
      if (!selectedIds.size) return;

      if (status === STATUS.RESOLVED) {
        const affected = data.filter((item) => selectedIds.has(item.id));
        setResolveQueue(affected);
        setResolveTotal(affected.length);
        return;
      }

      const affected = data.filter((item) => selectedIds.has(item.id));
      const now = new Date().toISOString();
      const next = data.map((item) =>
        selectedIds.has(item.id)
          ? {
              ...item,
              status,
              updatedAt: Date.now(),
              history: [
                ...(item.history ?? []),
                { action: "status_changed", to: status, date: now },
              ],
            }
          : item,
      );

      try {
        setData(next);
        await save(next);
        hapticSuccess();
        notify("success", `Статус изменён у ${affected.length} ${pluralLeaks(affected.length)}`);
        clearSelection();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [clearSelection, data, notify, save, selectedIds, setData],
  );

  const handleSequentialResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveQueue[0];
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((item) =>
        item.id === leak.id
          ? {
              ...item,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
              ...(photo_after != null && { photo_after }),
              ...(materials_equipment != null && { materials_equipment }),
              ...(note != null && { note }),
              updatedAt: Date.now(),
              history: [
                ...(item.history ?? []),
                { action: "status_changed", to: STATUS.RESOLVED, date: now },
              ],
            }
          : item,
      );

      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
        return;
      }

      const remaining = resolveQueue.slice(1);
      setResolveQueue(remaining);
      if (remaining.length === 0) {
        notify("success", `Устранено ${resolveTotal} ${pluralLeaks(resolveTotal)}`);
        clearSelection();
        setResolveTotal(0);
      }
    },
    [clearSelection, data, notify, resolveQueue, resolveTotal, save, setData],
  );

  /* ── Filter + sort strictly by date desc ── */
  const displayed = useMemo(() => {
    if (statusFilter === NEARBY) {
      let list = hasGps
        ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M)
        : [];

      if (priorityFilter !== ALL) {
        list = list.filter((l) => (l.priority ?? null) === priorityFilter);
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter((l) =>
          [
            l.leak_id,
            l.object,
            l.component,
            l.location,
            l.field,
            l.leak_description,
          ].some((v) => v?.toLowerCase().includes(q)),
        );
      }

      return list;
    }

    let list = [...data].sort((a, b) => sortAsc ? a.id - b.id : b.id - a.id);

    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
    }

    if (priorityFilter !== ALL) {
      list = list.filter((l) => (l.priority ?? null) === priorityFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        [
          l.leak_id,
          l.object,
          l.component,
          l.location,
          l.field,
          l.leak_description,
        ].some((v) => v?.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [data, statusFilter, priorityFilter, search, hasGps, coords, sortAsc]);

  const selectDisplayed = useCallback(() => {
    const ids = displayed.map((leak) => leak.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [displayed]);

  const selectedCount = selectedIds.size;
  const allDisplayedSelected =
    displayed.length > 0 && displayed.every((l) => selectedIds.has(l.id));

  /* ── Swipe → open status picker ── */
  const handlePickStatus = useCallback((leak) => {
    setPickerLeak(leak);
  }, []);

  /* ── Status picker → apply selected status ── */
  const handleStatusSelect = useCallback(
    async (newStatus) => {
      const leak = pickerLeak;
      setPickerLeak(null);
      if (!leak || newStatus === leak.status) return;

      if (newStatus === STATUS.RESOLVED) {
        setResolveLeak(leak);
        return;
      }

      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              status: newStatus,
              updatedAt: Date.now(),
              history: [
                ...(r.history ?? []),
                { action: "status_changed", to: newStatus, date: new Date().toISOString() },
              ],
            }
          : r,
      );
      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, pickerLeak, save, setData],
  );

  /* ── Resolve modal confirm ── */
  const handleResolveConfirm = useCallback(
    async ({ photo_after, materials_equipment, note }) => {
      const leak = resolveLeak;
      setResolveLeak(null);
      if (!leak) return;

      const now = new Date().toISOString();
      const next = data.map((r) =>
        r.id === leak.id
          ? {
              ...r,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
              photo_after: photo_after ?? r.photo_after,
              materials_equipment: materials_equipment ?? r.materials_equipment,
              note: note ?? r.note,
              updatedAt: Date.now(),
              history: [
                ...(r.history ?? []),
                { action: "status_changed", to: STATUS.RESOLVED, date: now },
              ],
            }
          : r,
      );
      try {
        setData(next);
        await save(next);
        hapticSuccess();
      } catch (err) {
        notify("error", "Ошибка сохранения: " + err.message);
      }
    },
    [data, notify, resolveLeak, save, setData],
  );

  /* ── Save from details ── */
  const handleSave = async (updated) => {
    const next = data.map((r) => (r.id === updated.id ? updated : r));
    try {
      setData(next);
      await save(next);
      hapticSuccess();
      setActiveLeak(null);
    } catch (err) {
      notify("error", "Ошибка сохранения: " + err.message);
    }
  };

  const handleDelete = useCallback(
    async (id) => {
      const next = data.filter((r) => r.id !== id);
      try {
        setData(next);
        await save(next);
        hapticSuccess();
        setActiveLeak(null);
        setSelectedIds((prev) => {
          if (!prev.has(id)) return prev;
          const nextSelected = new Set(prev);
          nextSelected.delete(id);
          return nextSelected;
        });
      } catch (err) {
        notify("error", "Ошибка удаления: " + err.message);
      }
    },
    [data, notify, save, setData],
  );

  const visible = displayed;

  /* ── Status counts for filter tabs ── */
  const counts = useMemo(() => {
    const c = { all: data.length };
    STATUS_ORDER.forEach((st) => {
      c[st] = data.filter((l) => (l.status ?? STATUS.OPEN) === st).length;
    });
    c[NEARBY] = hasGps
      ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M).length
      : 0;
    return c;
  }, [data, hasGps, coords]);

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <FilterBar
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setFilter={setFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        counts={counts}
        hasGps={hasGps}
      />

      <ResultsBar
        visibleCount={visible.length}
        totalCount={data.length}
        statusFilter={statusFilter}
        sortAsc={sortAsc}
        onSortToggle={() => setSortAsc((v) => !v)}
        selectedCount={selectedCount}
        allDisplayedSelected={allDisplayedSelected}
        onClearSelection={clearSelection}
        onSelectDisplayed={allDisplayedSelected ? clearSelection : selectDisplayed}
        onBulkStatusChange={handleBulkStatusChange}
        onExport={async () => {
          try {
            await exportToExcelZip(
              displayed,
              prepareRows(displayed),
              excelHeaders,
              excelKeys,
              "утечки",
              idbGetPhoto,
            );
            notify("success", "ZIP-архив успешно скачан");
          } catch (e) {
            notify("error", "Ошибка экспорта: " + e.message);
          }
        }}
      />

      {/* ── List ── */}
      <div className={s.list}>
        {visible.length ? (
          <VirtualizedLeakList
            items={visible ?? []}
            height={650}
            renderItem={(leak) => (
              <LeakCardCompact
                key={leak.id}
                leak={leak}
                onOpenDetails={setActiveLeak}
                onPickStatus={handlePickStatus}
                nearbyDist={leak._nearbyDist}
                selected={selectedIds.has(leak.id)}
                onToggleSelect={() => toggleSelected(leak.id)}
              />
            )}
          />
        ) : (
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
        )}
      </div>

      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={() => setActiveLeak(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {pickerLeak && (
        <StatusPickerModal
          current={pickerLeak.status ?? STATUS.OPEN}
          onSelect={handleStatusSelect}
          onClose={() => setPickerLeak(null)}
        />
      )}

      {resolveLeak && (
        <ResolveModal
          leak={resolveLeak}
          onConfirm={handleResolveConfirm}
          onClose={() => setResolveLeak(null)}
        />
      )}

      {resolveQueue.length > 0 && (
        <ResolveModal
          leak={resolveQueue[0]}
          progress={{
            current: resolveTotal - resolveQueue.length + 1,
            total: resolveTotal,
          }}
          onConfirm={handleSequentialResolveConfirm}
          onClose={() => {
            setResolveQueue([]);
            setResolveTotal(0);
          }}
        />
      )}
    </div>
  );
}

function pluralLeaks(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "записи";
  return "записей";
}
