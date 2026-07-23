import { memo, useState } from "react";
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
  nearbyDist,
  selected = false,
  onToggleSelect,
  className = "",
}) {
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
  const beforeLabel = t("leakDetails.photo.before", { defaultValue: "Before" });
  const afterLabel = t("leakDetails.photo.after", { defaultValue: "After" });
  const repairLabel = lang === "ru" ? "В ремонте" : "Under repair";

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
            <span className={s.hintText}>
              {t("cards.open", { defaultValue: "Open" })}
            </span>
          </div>
        )}

        {goingLeft && (
          <div className={s.hintLeft}>
            <span className={s.hintIcon}>☰</span>
            <span className={s.hintText}>
              {onMonitor
                ? t("cards.monitoring", {
                    defaultValue: lang === "ru" ? "Мониторинг" : "Monitoring",
                  })
                : t("cards.status", { defaultValue: "Status" })}
            </span>
          </div>
        )}

        <div
          className={`${s.card} ${selected ? s.selected : ""} ${
            goingLeft ? s.swipeLeft : ""
          } ${goingRight ? s.swipeRight : ""}`}
          data-urgency={urgency}
          data-priority={leak.priority ?? "none"}
          data-selected={selected ? "true" : "false"}
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
                aria-label={t("cards.selectLeak", {
                  defaultValue: selected
                    ? "Remove from selection"
                    : "Select leak",
                })}
                title={t("cards.selectLeak", {
                  defaultValue: selected
                    ? "Remove from selection"
                    : "Select leak",
                })}
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
              {lang === "ru" ? "№ Б-" : "№ T-"}
              {leak.leak_id ?? leak.index}
            </span>
            <span className={s.time}>{ago ?? absoluteDate}</span>
          </div>

          <div className={s.body}>
            {(leak.location || leak.object) && (
              <div className={s.titleBlock}>
                {leak.location && (
                  <span className={s.objectName}>{leak.location}</span>
                )}
                {leak.object && (
                  <span className={s.component}>{leak.object}</span>
                )}
              </div>
            )}
            {leak.component && (
              <div className={s.locationRow}>
                <span className={s.locationPin}>◉</span>
                <span className={s.locationText}>{leak.component}</span>
              </div>
            )}
            {leak.leak_description && (
              <p className={s.desc}>{leak.leak_description}</p>
            )}
          </div>

          {hasFooter && (
            <div className={s.foot}>
              <div className={s.chips}>
                {nearbyDist != null && (
                  <span className={s.chipNear}>
                    📌 {nearbyDist} {lang === "ru" ? "м" : "m"}
                  </span>
                )}
                {leak.leak_speed != null && (
                  <span className={s.chip}>
                    {leak.leak_speed} {lang === "ru" ? "л/мин" : "L/min"}
                  </span>
                )}
                {methane != null && (
                  <span className={s.chipCalc}>
                    ~{methane} {lang === "ru" ? "м3/г" : "m3/y"}
                  </span>
                )}
                {emissions != null && (
                  <span className={s.chipCalc}>
                    ~{emissions}{" "}
                    {lang === "ru" ? "т CO2-экв/год" : "t CO2-eq/year"}
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
