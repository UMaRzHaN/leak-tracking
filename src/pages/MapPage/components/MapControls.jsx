import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PRIORITY_ORDER, getPriorityMeta } from "@/utils/priority";
import { STATUS_ORDER, getStatusMeta } from "@/utils/status";

import s from "@/pages/MapPage/MapPage.module.scss";
import { FICTION_FILTER, MONITORING_FILTER } from "@/domain/leakFilters";
import ComponentStatusFilter from "./ComponentStatusFilter";
import ControlIcon from "./ControlIcon";
import FilterIcon from "./FilterIcon";
import LeakMetaFilter from "./LeakMetaFilter";

const FILTER_MENU = {
  COMPONENT_STATUS: "componentStatus",
  STATUS: "status",
  PRIORITY: "priority",
  FICTION: "fiction",
  NEARBY: "nearby",
  MONITORING: "monitoring",
};

export default function MapControls({
  onLocate,
  gpsEnabled = true,
  showsComponents = false,
  componentStatus = /** @type {any} */ (null),
  componentsAvailable = false,
  onToggleBase = /** @type {(() => void)|null} */ (null),
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
}) {
  const { t } = useLanguage();
  const [openFilterMenu, setOpenFilterMenu] = useState(
    /** @type {string|null} */ (null),
  );
  const isComponentStatusOpen = openFilterMenu === FILTER_MENU.COMPONENT_STATUS;
  const isStatusOpen = openFilterMenu === FILTER_MENU.STATUS;
  const isPriorityOpen = openFilterMenu === FILTER_MENU.PRIORITY;
  const isFictionOpen = openFilterMenu === FILTER_MENU.FICTION;
  const fictionActive = fictionFilter !== FICTION_FILTER.ALL;
  const isNearbyOpen = openFilterMenu === FILTER_MENU.NEARBY;
  const isMonitoringOpen = openFilterMenu === FILTER_MENU.MONITORING;
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
      {/*
       * Переключатель баз стоит отдельно от столбца кнопок и выглядит иначе.
       * Там кнопки отвечают на вопрос «что показать из этого», а он — на
       * вопрос «что это». Пока он был такой же кнопкой в том же столбце, его
       * читали как ещё один фильтр и не находили, когда искали.
       *
       * Фильтры по статусу, приоритету и кругу мониторинга описывают, как
       * разбираются с утечкой, — к железу это не относится, и на его базе они
       * не висят без дела, а пропадают.
       */}
      {componentsAvailable && (
        <button
          type="button"
          className={`${s.baseSwitch} ${
            showsComponents ? s.baseSwitchComponents : ""
          }`}
          onClick={() => onToggleBase?.()}
          aria-pressed={showsComponents}
          aria-label={t("map.controls.base")}
        >
          <span className={s.baseSwitchIcon} aria-hidden="true">
            {showsComponents ? "⚙" : "◉"}
          </span>
          <span className={s.baseSwitchLabel}>
            {showsComponents ? t("map.baseComponents") : t("map.baseLeaks")}
          </span>
          <span className={s.baseSwitchHint} aria-hidden="true">
            ⇄
          </span>
        </button>
      )}

      <div className={s.controls}>
        <button
          type="button"
          className={s.controlBtn}
          onClick={onLocate}
          disabled={!gpsEnabled}
          aria-label={t("map.controls.myLocation")}
        >
          <ControlIcon>
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </ControlIcon>
        </button>

        <button
          type="button"
          className={s.controlBtn}
          onClick={onOpenSheet}
          aria-label={t("map.controls.searchLeaks")}
        >
          <ControlIcon>
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" />
          </ControlIcon>
        </button>

        {!showsComponents && (
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
              <ControlIcon>
                <circle cx="12" cy="12" r="8" />
                <path d="m8.5 12 2.2 2.2 4.8-5" />
              </ControlIcon>
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
                    activeMonitoringFilter === id ? s.filterOptionBtnActive : ""
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
        <ControlIcon>
          <path d="M12 21a7 7 0 0 0 7-7c0-4-4-7-7-11-3 4-7 7-7 11a7 7 0 0 0 7 7z" />
          <path d="M12 17a3 3 0 0 0 3-3c0-1.7-1.6-3.1-3-5-1.4 1.9-3 3.3-3 5a3 3 0 0 0 3 3z" />
        </ControlIcon>
      </button>

      */}

        {!showsComponents && (
          <LeakMetaFilter
            label={t("map.statusFilter")}
            icon={<FilterIcon />}
            order={STATUS_ORDER}
            getMeta={getStatusMeta}
            selected={statusFilters}
            open={isStatusOpen}
            onToggleMenu={() => toggleFilterMenu(FILTER_MENU.STATUS)}
            onToggle={onStatusToggle}
            onClear={onStatusClear}
          />
        )}

        {/*
         * Состояние железа — только на своей базе, ровно как статус утечки
         * только на своей. Отбор общий с реестром: выбранное там видно здесь.
         */}
        <ComponentStatusFilter
          {...componentStatus}
          shown={showsComponents}
          open={isComponentStatusOpen}
          onToggleMenu={() => toggleFilterMenu(FILTER_MENU.COMPONENT_STATUS)}
        />

        {!showsComponents && (
          <LeakMetaFilter
            label={t("map.priorityFilter")}
            icon={
              <ControlIcon>
                <path d="M3 5h18" />
                <path d="M7 12h10" />
                <path d="M10 19h4" />
              </ControlIcon>
            }
            order={PRIORITY_ORDER}
            getMeta={getPriorityMeta}
            selected={priorityFilters}
            open={isPriorityOpen}
            onToggleMenu={() => toggleFilterMenu(FILTER_MENU.PRIORITY)}
            onToggle={onPriorityToggle}
            onClear={onPriorityClear}
          />
        )}

        {!showsComponents && onFictionChange && (
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
              <ControlIcon>
                <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
                <path d="M7 17 17 7" />
              </ControlIcon>
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

        {hasGps && (
          <div className={s.filterControlWrap}>
            <button
              type="button"
              className={`${s.controlBtn} ${nearbyOnly ? s.controlBtnActive : ""}`}
              onClick={() => toggleFilterMenu(FILTER_MENU.NEARBY)}
              aria-expanded={isNearbyOpen}
              aria-label={t("map.nearbyLeaks")}
            >
              <ControlIcon>
                <path d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11z" />
                <circle cx="12" cy="10" r="2" />
              </ControlIcon>
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
          <ControlIcon>
            {downloading ? (
              <path d="M7 7h10v10H7z" />
            ) : (
              <>
                <path d="M12 2v13M7 11l5 5 5-5" />
                <path d="M3 19h18" />
              </>
            )}
          </ControlIcon>
        </button>
      </div>
    </>
  );
}
