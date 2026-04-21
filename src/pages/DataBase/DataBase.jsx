import { useState, useMemo, useCallback } from "react";
import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";
import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";
import StatusPickerModal from "../../components/StatusPickerModal/StatusPickerModal";
import ResolveModal from "../../components/ResolveModal/ResolveModal";
import VirtualizedLeakList from "../../components/VirtualizedLeakList/VirtualizedLeakList";
import Notification from "../../components/Notification/Notification";
import { STATUS, STATUS_META, STATUS_ORDER } from "../../utils/status";
import { hapticSuccess } from "../../utils/haptics";
import { filterNearbyLeaks } from "../../utils/geoUtils";
import { exportToExcel } from "../../services/export/excel";
import { useProjectData } from "../../app/hooks/useProjectData";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import s from "./DataBase.module.scss";

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
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
    photo:        r.photo      ? "Есть" : "",
    photo_after:  r.photo_after ? "Есть" : "",
    resolvedAt:   fmtTs(r.resolvedAt),
  }));
}

export default function DataBase({ data, setData, coords }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setFilter] = useState(ALL);
  const [notification, setNotification] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pickerLeak, setPickerLeak] = useState(null);
  const [resolveLeak, setResolveLeak] = useState(null);
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false);

  const { save } = useProjectData();
  const projectConfig = useProjectConfig();
  const { headers: excelHeaders, keysOrder: excelKeys } =
    projectConfig.export.excel;

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
        setBulkResolveOpen(true);
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

      setData(next);
      await save(next);
      hapticSuccess();
      notify(
        "success",
        `Статус изменён у ${affected.length} ${pluralLeaks(affected.length)}`,
      );
      clearSelection();
    },
    [clearSelection, data, notify, save, selectedIds, setData],
  );

  const handleBulkResolveConfirm = useCallback(
    async ({ materials_equipment, note }) => {
      setBulkResolveOpen(false);
      const affected = data.filter((item) => selectedIds.has(item.id));
      const now = new Date().toISOString();
      const next = data.map((item) =>
        selectedIds.has(item.id)
          ? {
              ...item,
              status: STATUS.RESOLVED,
              resolvedAt: Date.now(),
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
      setData(next);
      await save(next);
      hapticSuccess();
      notify("success", `Устранено ${affected.length} ${pluralLeaks(affected.length)}`);
      clearSelection();
    },
    [clearSelection, data, notify, save, selectedIds, setData],
  );

  /* ── Filter + sort strictly by date desc ── */
  const displayed = useMemo(() => {
    if (statusFilter === NEARBY) {
      let list = hasGps
        ? filterNearbyLeaks(data, coords.lat, coords.lng, NEARBY_RADIUS_M)
        : [];

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

    let list = [...data].sort((a, b) => b.id - a.id);

    if (statusFilter !== ALL) {
      list = list.filter((l) => (l.status ?? STATUS.OPEN) === statusFilter);
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
  }, [data, statusFilter, search, hasGps, coords]);

  const selectDisplayed = useCallback(() => {
    const ids = displayed.map((leak) => leak.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [displayed]);

  const selectedCount = selectedIds.size;
  const allDisplayedSelected = displayed.length > 0 && displayed.every((l) => selectedIds.has(l.id));

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
      setData(next);
      await save(next);
      hapticSuccess();
    },
    [data, pickerLeak, save, setData],
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
      setData(next);
      await save(next);
      hapticSuccess();
    },
    [data, resolveLeak, save, setData],
  );

  /* ── Save from details ── */
  const handleSave = async (updated) => {
    const next = data.map((r) => (r.id === updated.id ? updated : r));
    setData(next);
    await save(next);
    hapticSuccess();
    setActiveLeak(null);
  };

  const handleDelete = useCallback(
    async (id) => {
      const next = data.filter((r) => r.id !== id);
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
    },
    [data, save, setData],
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

      {/* ── Search ── */}
      <div className={s.searchWrap}>
        <span className={s.searchIcon}>🔍</span>
        <input
          className={s.searchInput}
          placeholder="Поиск по ID, объекту, описанию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className={s.clearSearch} onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      {/* ── Status filter tabs ── */}
      <div className={s.filters}>
        <FilterTab
          id={ALL}
          label="Все"
          count={counts.all}
          active={statusFilter}
          onSelect={setFilter}
        />
        {STATUS_ORDER.map((st) => (
          <FilterTab
            key={st}
            id={st}
            label={STATUS_META[st].short}
            count={counts[st]}
            active={statusFilter}
            onSelect={setFilter}
            color={STATUS_META[st].color}
          />
        ))}
        {hasGps && (
          <FilterTab
            id={NEARBY}
            label="📍 Рядом"
            count={counts[NEARBY]}
            active={statusFilter}
            onSelect={setFilter}
            color="var(--c-blue)"
          />
        )}
      </div>

      {/* ── Results info + bulk actions + Export ── */}
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visible.length > 0
            ? statusFilter === NEARBY
              ? `${visible.length} ${pluralLeaks(visible.length)} • в радиусе ${NEARBY_RADIUS_M} м`
              : `${visible.length} ${pluralLeaks(visible.length)} • дата ↓`
            : null}
        </span>

        <div className={`${s.resultsActions} ${selectedCount > 0 ? s.resultsActionsSelected : ""}`}>
          {selectedCount > 0 ? (
            <>
              <span className={s.selectionInfo}>
                Выбрано: {selectedCount}
              </span>
              <button className={s.actionBtn} onClick={clearSelection}>
                Снять выбор
              </button>
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  className={`${s.actionBtn} ${s.statusBtn}`}
                  style={{
                    "--status-color": STATUS_META[status].color,
                    "--status-bg": STATUS_META[status].bg,
                    "--status-border": STATUS_META[status].border,
                  }}
                  onClick={() => handleBulkStatusChange(status)}
                >
                  {STATUS_META[status].short}
                </button>
              ))}
            </>
          ) : (
            <>
              {visible.length > 0 && (
                <button
                  className={s.actionBtn}
                  onClick={allDisplayedSelected ? clearSelection : selectDisplayed}
                >
                  {allDisplayedSelected ? "Снять всё" : "Выбрать всё"}
                </button>
              )}

              {data.length > 0 && (
                <button
                  className={s.exportBtn}
                  onClick={() => {
                    try {
                      exportToExcel(
                        prepareRows(displayed),
                        excelHeaders,
                        excelKeys,
                        "утечки",
                      );
                      notify("success", "Excel-файл успешно скачан");
                    } catch (e) {
                      console.error(e);
                      notify("error", "Ошибка экспорта Excel");
                    }
                  }}
                  title="Экспорт в Excel"
                >
                  📥 XLSX
                </button>
              )}
            </>
          )}
        </div>
      </div>

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

      {bulkResolveOpen && (
        <ResolveModal
          bulkCount={selectedIds.size}
          onConfirm={handleBulkResolveConfirm}
          onClose={() => setBulkResolveOpen(false)}
        />
      )}
    </div>
  );
}

function FilterTab({ id, label, count, active, onSelect, color }) {
  const isActive = active === id;
  return (
    <button
      className={`${s.filterTab} ${isActive ? s.filterActive : ""}`}
      style={isActive && color ? { borderColor: color, color } : undefined}
      onClick={() => onSelect(id)}
    >
      {label}
      {count > 0 && <span className={s.filterCount}>{count}</span>}
    </button>
  );
}

function pluralLeaks(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "записи";
  return "записей";
}
