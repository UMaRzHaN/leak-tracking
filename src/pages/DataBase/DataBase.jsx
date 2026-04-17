import { useState, useMemo, useCallback } from "react";
import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";
import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";
import VirtualizedLeakList from "../../components/VirtualizedLeakList/VirtualizedLeakList";
import Notification from "../../components/Notification/Notification";
import { STATUS, STATUS_META, STATUS_ORDER } from "../../utils/status";
import { nextStatus } from "../../utils/status";
import { hapticSuccess } from "../../utils/haptics";
import { filterNearbyLeaks } from "../../utils/geoUtils";
import { exportToExcel } from "../../services/export/excel";
import { useProjectData } from "../../app/hooks/useProjectData";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import s from "./DataBase.module.scss";

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
    status: r.status ?? "open",
    date:
      r.date ??
      (r.created_at
        ? new Date(Number(r.created_at)).toLocaleDateString("ru-RU")
        : ""),
    Total_Annual_Methane_Loss_m3_y: round2(r.Total_Annual_Methane_Loss_m3_y),
    Emissions_t_CO2eq_year: round2(r.Emissions_t_CO2eq_year),
  }));
}

export default function DataBase({ data, setData, coords }) {
  const [activeLeak, setActiveLeak] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setFilter] = useState(ALL);
  const [notification, setNotification] = useState(null);

  const { save } = useProjectData();
  const projectConfig = useProjectConfig();
  const { headers: excelHeaders, keysOrder: excelKeys } =
    projectConfig.export.excel;

  const hasGps = Boolean(coords?.lat && coords?.lng);

  const notify = useCallback((type, message) => {
    setNotification({ type, message });
  }, []);

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

  /* ── Status change via swipe ── */
  const handleStatusChange = useCallback(
    async (id) => {
      const next = data.map((r) =>
        r.id === id ? { ...r, status: nextStatus(r.status) } : r,
      );
      setData(next);
      await save(next);
      hapticSuccess();
    },
    [data, save, setData],
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

      {/* ── Results info + Export ── */}
      <div className={s.resultsRow}>
        <span className={s.resultsInfo}>
          {visible.length > 0
            ? statusFilter === NEARBY
              ? `${visible.length} ${pluralLeaks(visible.length)} • в радиусе ${NEARBY_RADIUS_M} м`
              : `${visible.length} ${pluralLeaks(visible.length)} • дата ↓`
            : null}
        </span>

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
                onStatusChange={handleStatusChange}
                nearbyDist={leak._nearbyDist}
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