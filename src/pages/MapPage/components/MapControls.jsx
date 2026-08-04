import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PRIORITY_ORDER, getPriorityMeta } from "@/utils/priority";
import { STATUS_ORDER, getStatusMeta } from "@/utils/status";
import { MONITORING_FILTER } from "@/pages/Monitoring/monitoringDomain";
import s from "@/pages/MapPage/MapPage.module.scss";

const FILTER_MENU = {
  STATUS: "status",
  PRIORITY: "priority",
  NEARBY: "nearby",
  MONITORING: "monitoring",
};

export default function MapControls({
  onLocate,
  gpsEnabled = true,
  onOpenSheet,
  onDownload,
  onCancelDownload,
  downloading,
  nearbyOnly,
  nearbyRadius,
  nearbyRadiusOptions,
  priorityFilters,
  statusFilters,
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
  const [openFilterMenu, setOpenFilterMenu] = useState(null);
  const statusSet = new Set(statusFilters);
  const statusActive = statusFilters.length > 0;
  const prioritySet = new Set(priorityFilters);
  const priorityActive = priorityFilters.length > 0;
  const isStatusOpen = openFilterMenu === FILTER_MENU.STATUS;
  const isPriorityOpen = openFilterMenu === FILTER_MENU.PRIORITY;
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
    <div className={s.controls}>
      <button
        type="button"
        className={s.controlBtn}
        onClick={onLocate}
        disabled={!gpsEnabled}
        aria-label={t("map.controls.myLocation", {
          defaultValue: "My location",
        })}
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
        className={s.controlBtn}
        onClick={onOpenSheet}
        aria-label={t("map.controls.searchLeaks", {
          defaultValue: "Search leaks",
        })}
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
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
      </button>

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

      <div className={s.filterControlWrap}>
        <button
          type="button"
          className={`${s.controlBtn} ${statusActive ? s.controlBtnActive : ""}`}
          onClick={() => toggleFilterMenu(FILTER_MENU.STATUS)}
          aria-expanded={isStatusOpen}
          aria-label={t("map.statusFilter")}
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
            <path d="M9 6h11" />
            <path d="M9 12h11" />
            <path d="M9 18h11" />
            <path d="M4 6h.01" />
            <path d="M4 12h.01" />
            <path d="M4 18h.01" />
          </svg>
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

      <button
        type="button"
        className={`${s.controlBtn} ${downloading ? s.controlBtnActive : ""}`}
        onClick={downloading ? onCancelDownload : onDownload}
        aria-label={
          downloading
            ? t("map.cancelDownload")
            : t("map.controls.downloadArea", {
                defaultValue: "Download current area map",
              })
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
  );
}
