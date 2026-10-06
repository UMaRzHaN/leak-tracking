import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PRIORITY_ORDER, getPriorityMeta } from "@/utils/priority";
import { STATUS_ORDER, getStatusMeta } from "@/utils/status";

import s from "@/pages/MapPage/MapPage.module.scss";
import {
  FICTION_FILTER,
  MONITORING_FILTER,
  TAG_FILTER,
} from "@/domain/leakFilters";
import { MAP_FILTER, mapFiltersFor } from "@/pages/MapPage/mapModuleFilters";
import ComponentStatusFilter from "./ComponentStatusFilter";
import FilterIcon from "./FilterIcon";
import Icon from "@/components/ui/Icon/Icon";
import { REPAIR_STAGE_ORDER, getRepairStageMeta } from "@/utils/repairStage";

const FILTER_MENU = {
  COMPONENT_STATUS: "componentStatus",
  STATUS: "status",
  PRIORITY: "priority",
  FICTION: "fiction",
  NEARBY: "nearby",
  MONITORING: "monitoring",
  TAG: "tag",
  STAGE: "stage",
};

export default function MapControls({
  onLocate,
  gpsEnabled = true,
  showsComponents = false,
  componentStatus = /** @type {any} */ (null),
  // Отборы модуля (mapModuleFilters): по умолчанию все.
  filters = mapFiltersFor(),
  tagFilter = TAG_FILTER.ALL,
  onTagChange = /** @type {((value: string) => void)|null} */ (null),
  tagCounts = /** @type {{with:number, without:number}|null} */ (null),
  // Стадии ремонта (7i): «Все» и счётчики по каждой.
  stage = "all",
  stageCounts = /** @type {Record<string, number>|null} */ (null),
  onStageChange = /** @type {((value: string) => void)|null} */ (null),
  onOpenSheet,
  onDownload,
  onCancelDownload,
  downloading,
  nearbyOnly,
  nearbyRadius,
  nearbyRadiusOptions,
  priorityFilters,
  statusFilters,
  fictionFilter = FICTION_FILTER.ALL,
  onFictionChange = /** @type {((value: string) => void)|null} */ (null),
  monitoringFilter,
  hasMonitoringRound,
  hasGps,
  onToggleNearby,
  onRadiusChange,
  onPriorityToggle,
  onPriorityClear,
  onStatusToggle,
  onStatusClear,
  onMonitoringChange,
  // Подпись модуля в строке поиска (5d): «Утечки», «Ремонты»…
  moduleLabel = "",
}) {
  const { t } = useLanguage();
  const [openFilterMenu, setOpenFilterMenu] = useState(
    /** @type {string|null} */ (null),
  );
  const statusSet = new Set(statusFilters);
  const statusActive = statusFilters.length > 0;
  const prioritySet = new Set(priorityFilters);
  const priorityActive = priorityFilters.length > 0;
  const isComponentStatusOpen = openFilterMenu === FILTER_MENU.COMPONENT_STATUS;
  const isStatusOpen = openFilterMenu === FILTER_MENU.STATUS;
  const isPriorityOpen = openFilterMenu === FILTER_MENU.PRIORITY;
  const isFictionOpen = openFilterMenu === FILTER_MENU.FICTION;
  const fictionActive = fictionFilter !== FICTION_FILTER.ALL;
  const isNearbyOpen = openFilterMenu === FILTER_MENU.NEARBY;
  const isMonitoringOpen = openFilterMenu === FILTER_MENU.MONITORING;
  const isTagOpen = openFilterMenu === FILTER_MENU.TAG;
  const leaksShown = !showsComponents;
  const shows = (kind) => leaksShown && filters.has(kind);
  const showsTag = shows(MAP_FILTER.TAG) && Boolean(onTagChange);
  const tagActive = showsTag && tagFilter !== TAG_FILTER.ALL;
  const isStageOpen = openFilterMenu === FILTER_MENU.STAGE;
  const showsStage =
    shows(MAP_FILTER.STAGE) && Boolean(stageCounts && onStageChange);
  const stageActive = showsStage && stage !== "all";
  const activeMonitoringFilter = hasMonitoringRound
    ? monitoringFilter
    : MONITORING_FILTER.ALL;
  const monitoringActive =
    hasMonitoringRound && activeMonitoringFilter !== MONITORING_FILTER.ALL;
  const monitoringLabels = {
    due: t("map.monitoringDue"),
    checked: t("map.monitoringChecked"),
    all: t("map.monitoringAll"),
  };
  const formatRadius = (radius) =>
    radius >= 1000
      ? `${radius / 1000}${t("map.radiusKm")}`
      : `${radius}${t("map.radiusM")}`;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Сколько отборов включено — число на кнопке «Фильтры».
  const activeCount = showsComponents
    ? (componentStatus?.selected?.length ?? 0) + (nearbyOnly ? 1 : 0)
    : [
        shows(MAP_FILTER.STATUS) && statusActive,
        shows(MAP_FILTER.PRIORITY) && priorityActive,
        shows(MAP_FILTER.FICTION) && fictionActive,
        shows(MAP_FILTER.MONITORING) && monitoringActive,
        tagActive,
        stageActive,
        nearbyOnly,
      ].filter(Boolean).length;
  const resetAll = () => {
    if (showsComponents) componentStatus?.onClear?.();
    else {
      // Сбрасывается только видимое: статус с приоритетом общие с базой, и
      // «Сбросить» в мониторинге не должен трогать её отбор.
      if (shows(MAP_FILTER.STATUS)) onStatusClear();
      if (shows(MAP_FILTER.PRIORITY)) onPriorityClear();
      if (shows(MAP_FILTER.FICTION)) onFictionChange?.(FICTION_FILTER.ALL);
      if (shows(MAP_FILTER.MONITORING) && hasMonitoringRound)
        onMonitoringChange(MONITORING_FILTER.ALL);
      onTagChange?.(TAG_FILTER.ALL);
      if (showsStage) onStageChange("all");
    }
    if (nearbyOnly) onToggleNearby(false);
  };
  const toggleFilterMenu = (menu) =>
    setOpenFilterMenu((current) => (current === menu ? null : menu));
  const selectNearbyRadius = (radius) => {
    onRadiusChange(radius);
    setOpenFilterMenu(null);
  };
  const clearNearby = () => {
    onToggleNearby(false);
    setOpenFilterMenu(null);
  };

  return (
    <>
      {/* Строка поиска и фильтры сверху (5d): поиск по номеру — во весь
          ряд, все отборы — одной кнопкой со счётчиком, в шторке. */}
      <div className={s.topBar}>
        <button
          type="button"
          className={s.topSearch}
          onClick={onOpenSheet}
          aria-label={t("map.controls.searchLeaks")}
        >
          <Icon name="search" size={17} />
          <span className={s.topSearchText}>
            {moduleLabel && <span className={s.topModule}>{moduleLabel}</span>}
            <span className={s.topPlaceholder}>
              {t("map.searchPlaceholder")}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={s.topFilter}
          onClick={() => setSheetOpen(true)}
          aria-label={t("map.filters")}
        >
          <Icon name="list" size={18} />
          {activeCount > 0 && (
            <span className={s.topFilterBadge}>{activeCount}</span>
          )}
        </button>
      </div>

      <div className={s.controls}>
        <button
          type="button"
          className={s.controlBtn}
          onClick={onLocate}
          disabled={!gpsEnabled}
          aria-label={t("map.controls.myLocation")}
        >
          <svg
            className={s.controlIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>

        <button
          type="button"
          className={`${s.controlBtn} ${downloading ? s.controlBtnActive : ""}`}
          onClick={downloading ? onCancelDownload : onDownload}
          aria-label={
            downloading
              ? t("map.cancelDownload")
              : t("map.controls.downloadArea")
          }
        >
          <svg
            className={s.controlIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {downloading ? (
              <path d="M7 7h10v10H7z" />
            ) : (
              <>
                <path d="M12 2v13M7 11l5 5 5-5" />
                <path d="M3 19h18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {sheetOpen && (
        <div className={s.filterSheetRoot}>
          <div
            className={s.filterSheetBackdrop}
            data-modal-backdrop=""
            onClick={() => setSheetOpen(false)}
          />
          <div
            className={s.filterSheet}
            role="dialog"
            aria-modal="true"
            aria-label={t("map.filters")}
          >
            <div className={s.filterSheetHead}>
              <h2>{t("map.filters")}</h2>
              <span>{moduleLabel}</span>
              <button
                type="button"
                className={s.filterSheetReset}
                onClick={resetAll}
                disabled={activeCount === 0}
              >
                {t("map.reset")}
              </button>
            </div>
            <div className={s.filterSheetBody}>
              {shows(MAP_FILTER.MONITORING) && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${
                      monitoringActive ? s.controlBtnActive : ""
                    }`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.MONITORING)}
                    aria-expanded={isMonitoringOpen}
                    aria-label={t("map.monitoringFilter")}
                  >
                    <svg
                      className={s.controlIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="8" />
                      <path d="m8.5 12 2.2 2.2 4.8-5" />
                    </svg>
                  </button>
                  <div
                    className={`${s.filterFlyout} ${
                      isMonitoringOpen ? s.filterFlyoutOpen : ""
                    }`}
                  >
                    {[
                      [MONITORING_FILTER.ALL, monitoringLabels.all],
                      [MONITORING_FILTER.DUE, monitoringLabels.due],
                      [MONITORING_FILTER.CHECKED, monitoringLabels.checked],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`${s.filterOptionBtn} ${
                          activeMonitoringFilter === id
                            ? s.filterOptionBtnActive
                            : ""
                        }`}
                        aria-pressed={activeMonitoringFilter === id}
                        onClick={() =>
                          onMonitoringChange(
                            hasMonitoringRound ? id : MONITORING_FILTER.ALL,
                          )
                        }
                      >
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/*
      <button
        type="button"
        className={`${s.controlBtn} ${heatmapEnabled ? s.controlBtnActive : ""}`}
        onClick={onToggleHeatmap}
        aria-label={t("map.heatmap")}
      >
        <svg
          className={s.controlIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 21a7 7 0 0 0 7-7c0-4-4-7-7-11-3 4-7 7-7 11a7 7 0 0 0 7 7z" />
          <path d="M12 17a3 3 0 0 0 3-3c0-1.7-1.6-3.1-3-5-1.4 1.9-3 3.3-3 5a3 3 0 0 0 3 3z" />
        </svg>
      </button>

      */}

              {showsStage && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${stageActive ? s.controlBtnActive : ""}`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.STAGE)}
                    aria-expanded={isStageOpen}
                    aria-label={t("repairs.chipsLabel")}
                  >
                    <Icon name="wrench" size={18} />
                  </button>
                  <div
                    className={`${s.filterFlyout} ${isStageOpen ? s.filterFlyoutOpen : ""}`}
                  >
                    {["all", ...REPAIR_STAGE_ORDER].map((key) => {
                      const isActive = stage === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`${s.filterOptionBtn} ${
                            isActive ? s.filterOptionBtnActive : ""
                          }`}
                          aria-pressed={isActive}
                          onClick={() => onStageChange(key)}
                        >
                          {key !== "all" && (
                            <span
                              className={s.stageDot}
                              style={{
                                background: getRepairStageMeta(key, t).dot,
                              }}
                            />
                          )}
                          {key === "all"
                            ? t("repairs.all")
                            : t(`repairs.stages.${key}`)}
                          <span className={s.stageCount}>
                            {stageCounts[key] ?? 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {shows(MAP_FILTER.STATUS) && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${statusActive ? s.controlBtnActive : ""}`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.STATUS)}
                    aria-expanded={isStatusOpen}
                    aria-label={t("map.statusFilter")}
                  >
                    <FilterIcon />
                  </button>
                  <div
                    className={`${s.filterFlyout} ${isStatusOpen ? s.filterFlyoutOpen : ""}`}
                  >
                    <button
                      type="button"
                      className={s.filterOptionBtn}
                      onClick={onStatusClear}
                    >
                      {t("map.all")}
                    </button>
                    {STATUS_ORDER.map((status) => {
                      const meta = getStatusMeta(status, t);
                      const isActive = statusSet.has(status);

                      return (
                        <button
                          key={status}
                          type="button"
                          className={`${s.filterOptionBtn} ${
                            isActive ? s.filterOptionBtnActive : ""
                          }`}
                          style={
                            isActive
                              ? {
                                  borderColor: meta.border,
                                  color: meta.color,
                                  background: meta.bg,
                                }
                              : undefined
                          }
                          onClick={() => onStatusToggle(status)}
                        >
                          {meta.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*
               * Состояние железа — только на своей базе, ровно как статус утечки
               * только на своей. Отбор общий с реестром: выбранное там видно здесь.
               */}
              <ComponentStatusFilter
                {...componentStatus}
                shown={showsComponents}
                open={isComponentStatusOpen}
                onToggleMenu={() =>
                  toggleFilterMenu(FILTER_MENU.COMPONENT_STATUS)
                }
              />

              {shows(MAP_FILTER.PRIORITY) && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${priorityActive ? s.controlBtnActive : ""}`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.PRIORITY)}
                    aria-expanded={isPriorityOpen}
                    aria-label={t("map.priorityFilter")}
                  >
                    <svg
                      className={s.controlIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 5h18" />
                      <path d="M7 12h10" />
                      <path d="M10 19h4" />
                    </svg>
                  </button>
                  <div
                    className={`${s.filterFlyout} ${isPriorityOpen ? s.filterFlyoutOpen : ""}`}
                  >
                    <button
                      type="button"
                      className={s.filterOptionBtn}
                      onClick={onPriorityClear}
                    >
                      {t("map.all")}
                    </button>
                    {PRIORITY_ORDER.map((priority) => {
                      const meta = getPriorityMeta(priority, t);
                      const isActive = prioritySet.has(priority);

                      return (
                        <button
                          key={priority}
                          type="button"
                          className={`${s.filterOptionBtn} ${
                            isActive ? s.filterOptionBtnActive : ""
                          }`}
                          style={
                            isActive
                              ? {
                                  borderColor: meta.border,
                                  color: meta.color,
                                  background: meta.bg,
                                }
                              : undefined
                          }
                          onClick={() => onPriorityToggle(priority)}
                        >
                          {meta.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {shows(MAP_FILTER.FICTION) && onFictionChange && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${fictionActive ? s.controlBtnActive : ""}`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.FICTION)}
                    aria-expanded={isFictionOpen}
                    aria-label={t("map.fictionFilter")}
                  >
                    {/* Пунктирный круг с косой чертой — как пунктирная рамка фикции
                  на карточке: «тут ничего нет». */}
                    <svg
                      className={s.controlIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
                      <path d="M7 17 17 7" />
                    </svg>
                  </button>
                  <div
                    className={`${s.filterFlyout} ${isFictionOpen ? s.filterFlyoutOpen : ""}`}
                  >
                    {[
                      [FICTION_FILTER.ALL, t("map.all")],
                      [FICTION_FILTER.ONLY, t("map.fictionOnly")],
                      [FICTION_FILTER.EXCLUDE, t("map.fictionExclude")],
                    ].map(([id, label]) => {
                      const isActive = fictionFilter === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`${s.filterOptionBtn} ${
                            isActive ? s.filterOptionBtnActive : ""
                          }`}
                          style={
                            isActive && id === FICTION_FILTER.ONLY
                              ? {
                                  borderColor: "var(--c-fiction)",
                                  color: "var(--c-fiction)",
                                  background:
                                    "color-mix(in srgb, var(--c-fiction) 14%, transparent)",
                                }
                              : undefined
                          }
                          aria-pressed={isActive}
                          onClick={() => onFictionChange(id)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {showsTag && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${tagActive ? s.controlBtnActive : ""}`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.TAG)}
                    aria-expanded={isTagOpen}
                    aria-label={t("map.tagFilter")}
                  >
                    {/* Физ. тег на проволоке — как маркер на месте утечки. */}
                    <svg
                      className={s.controlIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
                      <circle cx="7.5" cy="7.5" r="1.5" />
                    </svg>
                  </button>
                  <div
                    className={`${s.filterFlyout} ${isTagOpen ? s.filterFlyoutOpen : ""}`}
                  >
                    {[
                      [
                        TAG_FILTER.ALL,
                        t("map.all"),
                        tagCounts && tagCounts.with + tagCounts.without,
                      ],
                      [TAG_FILTER.WITH, t("map.tagWith"), tagCounts?.with],
                      [
                        TAG_FILTER.WITHOUT,
                        t("map.tagWithout"),
                        tagCounts?.without,
                      ],
                    ].map(([id, label, count]) => {
                      const isActive = tagFilter === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`${s.filterOptionBtn} ${
                            isActive ? s.filterOptionBtnActive : ""
                          }`}
                          aria-pressed={isActive}
                          onClick={() =>
                            onTagChange(/** @type {string} */ (id))
                          }
                        >
                          {label}
                          {typeof count === "number" && (
                            <span className={s.stageCount}>{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasGps && (
                <div className={s.filterControlWrap}>
                  <button
                    type="button"
                    className={`${s.controlBtn} ${nearbyOnly ? s.controlBtnActive : ""}`}
                    onClick={() => toggleFilterMenu(FILTER_MENU.NEARBY)}
                    aria-expanded={isNearbyOpen}
                    aria-label={t("map.nearbyLeaks")}
                  >
                    <svg
                      className={s.controlIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11z" />
                      <circle cx="12" cy="10" r="2" />
                    </svg>
                  </button>
                  <div
                    className={`${s.filterFlyout} ${isNearbyOpen ? s.filterFlyoutOpen : ""}`}
                  >
                    <button
                      type="button"
                      className={s.filterOptionBtn}
                      onClick={clearNearby}
                    >
                      {t("map.all")}
                    </button>
                    {nearbyRadiusOptions.map((radius) => (
                      <button
                        key={radius}
                        type="button"
                        className={`${s.filterOptionBtn} ${
                          nearbyOnly && nearbyRadius === radius
                            ? s.filterOptionBtnActive
                            : ""
                        }`}
                        onClick={() => selectNearbyRadius(radius)}
                      >
                        {formatRadius(radius)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={s.filterSheetApply}
              onClick={() => setSheetOpen(false)}
            >
              {t("map.done")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
