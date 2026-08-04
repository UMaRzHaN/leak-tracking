import { useRenderMetric } from "@/utils/renderMetrics";
import { memo, useEffect, useState } from "react";
import { useSwipeCard } from "@/hooks/useSwipeCard";
import { getStatusMeta } from "@/utils/status";
import { getPriorityMeta } from "@/utils/priority";
import { timeAgo } from "@/utils/timeAgo";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  formatCompactNumber,
  formatLeakDate,
  formatNumber,
} from "@/utils/locale";
import { getLatestMonitoringPhotoPath } from "@/utils/monitoring";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import s from "./LeakCardCompact.module.scss";

function fmtNum(value, decimals = 1, lang) {
  if (value == null || !Number.isFinite(Number(value))) return null;

  const normalized = Number(value);
  if (Math.abs(normalized) >= 1_000) {
    return formatCompactNumber(
      normalized,
      { maximumFractionDigits: decimals },
      lang,
    );
  }

  return formatNumber(normalized, { maximumFractionDigits: decimals }, lang);
}

function urgencyOf(createdAt, status) {
  if (status === "resolved") return "resolved";

  const ms = Date.now() - Number(new Date(createdAt));
  if (ms < 86_400_000) return "fresh";
  if (ms < 7 * 86_400_000) return "warning";
  return "danger";
}

function LeakCardCompact({
  leak,
  onPickStatus,
  onMonitor,
  onOpenDetails,
  nearbyDist = null,
  selected = false,
  onToggleSelect = null,
  className = "",
  collapsible = true,
  defaultExpanded = false,
}) {
  useRenderMetric("LeakCardCompact");

  const { lang, t } = useLanguage();
  const { swipeState, swipeOffset, close, handlers } = useSwipeCard({
    leak,
    onOpenDetails,
    onPickStatus,
    onMonitor,
  });

  const swiping = swipeOffset !== 0;
  const goingLeft = swipeState === "left" || swipeOffset < -30;
  const goingRight = swipeState === "right" || swipeOffset > 30;

  const status = leak.status ?? "open";
  const meta = getStatusMeta(status, t);
  const priorityMeta = leak.priority
    ? getPriorityMeta(leak.priority, t, lang)
    : null;
  const ago = timeAgo(leak.createdAt, lang);
  const absoluteDate = formatLeakDate(leak.date, {}, lang);
  const urgency = urgencyOf(leak.createdAt, status);

  const [viewerIndex, setViewerIndex] = useState(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, leak.id]);

  const toggleExpanded = () => {
    if (collapsible && !swiping) setExpanded((value) => !value);
  };

  const photoSrc = usePhotoSrc(leak.photo ?? null);
  const monitoringPhotoSrc = usePhotoSrc(getLatestMonitoringPhotoPath(leak));
  const photoAfterSrc = usePhotoSrc(
    status === "resolved" ? (leak.photo_after ?? null) : null,
  );
  const photoRepairSrc = usePhotoSrc(
    status === "in_progress" || status === "resolved"
      ? (leak.photo_repair ?? null)
      : null,
  );

  const emissions = fmtNum(leak.Emissions_t_CO2eq_year, 2, lang);
  const methane = fmtNum(leak.Total_Annual_Methane_Loss_m3_y, 0, lang);
  const beforeLabel = t("leakDetails.photo.before");
  const afterLabel = t("leakDetails.photo.after");
  const repairLabel = t("leakDetails.photo.repair");
  const selectToggleLabel = selected
    ? t("cards.deselectLeak")
    : t("cards.selectLeak");

  const comparePairs = [
    photoSrc ? { key: "before", src: photoSrc, label: beforeLabel } : null,
    photoRepairSrc
      ? { key: "repair", src: photoRepairSrc, label: repairLabel }
      : null,
    photoAfterSrc
      ? { key: "after", src: photoAfterSrc, label: afterLabel }
      : null,
  ].filter(Boolean);

  const showBook = comparePairs.length >= 2;
  const showRepairStack = Boolean(photoRepairSrc) && status === "in_progress";
  const displayPhotoSrc =
    !showBook && status === "open" && monitoringPhotoSrc
      ? monitoringPhotoSrc
      : photoSrc || photoRepairSrc || photoAfterSrc;
  const hasPhoto = comparePairs.length > 0 || Boolean(displayPhotoSrc);
  const hasChips =
    leak.leak_speed != null ||
    leak.pressure != null ||
    nearbyDist != null ||
    emissions != null ||
    methane != null;
  const hasFooter = hasChips || hasPhoto;

  const viewerPhotos = showBook
    ? comparePairs.map((pair) => pair.src)
    : [displayPhotoSrc].filter(Boolean);
  const viewerLabels = showBook ? comparePairs.map((pair) => pair.label) : [];

  return (
    <>
      <div className={`${s.wrapper} ${className}`} onClick={close}>
        {goingRight && (
          <div className={s.hintRight}>
            <span className={s.hintIcon}>→</span>
            <span className={s.hintText}>{t("cards.open")}</span>
          </div>
        )}

        {goingLeft && (
          <div className={s.hintLeft}>
            <span className={s.hintIcon}>☰</span>
            <span className={s.hintText}>
              {onMonitor ? t("cards.monitoring") : t("cards.status")}
            </span>
          </div>
        )}

        <div
          className={`${s.card} ${selected ? s.selected : ""} ${
            collapsible && !expanded ? s.collapsed : ""
          } ${goingLeft ? s.swipeLeft : ""} ${goingRight ? s.swipeRight : ""}`}
          data-urgency={urgency}
          data-priority={leak.priority ?? "none"}
          data-selected={selected ? "true" : "false"}
          onClick={toggleExpanded}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: swiping ? "none" : "transform var(--t-spring)",
          }}
          {...handlers}
        >
          <div className={s.head} style={{ background: meta.bg }}>
            {onToggleSelect && (
              <button
                type="button"
                className={`${s.selectToggle} ${
                  selected ? s.selectToggleActive : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(leak.id);
                }}
                aria-pressed={selected}
                aria-label={selectToggleLabel}
                title={selectToggleLabel}
              >
                <span className={s.selectToggleMark}>
                  {selected ? "✓" : ""}
                </span>
              </button>
            )}

            <span
              className={s.statusPill}
              style={{
                color: meta.color,
                background: meta.bg,
                borderColor: meta.border,
              }}
            >
              {meta.label}
            </span>
            {priorityMeta && (
              <span
                className={s.priorityPill}
                style={{
                  color: priorityMeta.color,
                  background: priorityMeta.bg,
                  borderColor: priorityMeta.border,
                }}
              >
                {priorityMeta.short}
              </span>
            )}
            <span className={s.id}>
              {t("cards.tagPrefix")}
              {leak.leak_id ?? leak.index}
            </span>
            <span className={s.time}>{ago ?? absoluteDate}</span>
            {collapsible && (
              <button
                type="button"
                className={s.expandToggle}
                aria-expanded={expanded}
                aria-label={expanded ? t("cards.collapse") : t("cards.expand")}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded();
                }}
              >
                <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
              </button>
            )}
          </div>

          <div className={s.body}>
            {(leak.location || leak.address) && (
              <div className={s.titleBlock}>
                <span className={s.locationName}>
                  {leak.location || leak.address}
                </span>
                {leak.object && (
                  <span className={s.objectName}>{leak.object}</span>
                )}
              </div>
            )}
            {(leak.component || leak.leak_description) && (
              <div className={s.componentDetails}>
                {leak.component && (
                  <div className={s.componentRow}>
                    <span className={s.componentBullet}>◉</span>
                    <span className={s.componentName}>{leak.component}</span>
                  </div>
                )}
                {leak.leak_description && (
                  <div
                    className={`${s.descRow} ${
                      leak.component ? s.descRowConnected : ""
                    }`}
                  >
                    {leak.component ? (
                      <span
                        className={s.descConnector}
                        data-description-connector="true"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className={s.descStandaloneArrow}
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    )}
                    <p className={s.desc}>{leak.leak_description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {hasFooter && (
            <div className={s.foot}>
              <div className={s.chips}>
                {nearbyDist != null && (
                  <span className={s.chipNear}>
                    📌 {nearbyDist} {t("cards.units.meters")}
                  </span>
                )}
                {leak.leak_speed != null && (
                  <span className={s.chip}>
                    {leak.leak_speed} {t("cards.units.litresPerMinute")}
                  </span>
                )}
                {methane != null && (
                  <span className={s.chipCalc}>
                    ~{methane} {t("cards.units.cubicMetresPerYear")}
                  </span>
                )}
                {emissions != null && (
                  <span className={s.chipCalc}>
                    ~{emissions} {t("cards.units.tonnesCo2PerYear")}
                  </span>
                )}
              </div>
              {showBook ? (
                <div
                  className={`${s.photoStack} ${
                    comparePairs.length >= 3 ? s.photoStackTriple : ""
                  } ${showRepairStack ? s.photoStackRepair : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewerIndex(0);
                  }}
                >
                  {comparePairs.map((pair, index) => {
                    const isFront = index === 0;
                    const isBack = index === comparePairs.length - 1;
                    return (
                      <div
                        key={pair.label}
                        className={`${s.photoStackItem} ${
                          isFront
                            ? s.photoStackFront
                            : isBack
                              ? s.photoStackBack
                              : s.photoStackMiddle
                        } ${s[`photoStack${pair.key}`] ?? ""}`}
                      >
                        <img
                          src={pair.src}
                          alt={pair.label}
                          className={s.photoStackImg}
                          loading="lazy"
                          draggable={false}
                        />
                        <span
                          className={
                            isFront ? s.photoStackLabel : s.photoStackBackLabel
                          }
                        >
                          {pair.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                hasPhoto && (
                  <div
                    className={s.photoThumb}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerIndex(0);
                    }}
                  >
                    <img
                      src={displayPhotoSrc}
                      alt=""
                      className={s.photoThumbImg}
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <PhotoViewer
          photos={viewerPhotos}
          labels={viewerLabels}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

export default memo(LeakCardCompact);
