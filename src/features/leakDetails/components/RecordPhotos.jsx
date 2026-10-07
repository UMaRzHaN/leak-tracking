import { useState } from "react";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

function RecordPhoto({ path, label }) {
  const src = usePhotoSrc(path ?? null);
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!src) return null;

  return (
    <div className={s.monitoringPhotoBlock}>
      <span className={s.monitoringPhotoTitle}>{label}</span>
      <button
        type="button"
        className={s.monitoringPhotoBtn}
        onClick={() => setViewerOpen(true)}
        aria-label={label}
      >
        <img
          src={src}
          alt={label}
          className={s.monitoringPhotoImg}
          loading="lazy"
          draggable={false}
        />
      </button>
      {viewerOpen && (
        <PhotoViewer src={src} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}

/**
 * Снимки записи лога — «до» и «после» рядом, как у осмотра в мониторинге.
 * Ремонт и сверка показывают их одинаково, поэтому разметка одна.
 *
 * @param {{ before?: string|null, beforeLabel: string, after?: string|null, afterLabel: string }} props
 */
export default function RecordPhotos({
  before = null,
  beforeLabel,
  after = null,
  afterLabel,
}) {
  if (!before && !after) return null;
  return (
    <div className={s.monitoringPhotos}>
      {before && <RecordPhoto path={before} label={beforeLabel} />}
      {after && <RecordPhoto path={after} label={afterLabel} />}
    </div>
  );
}
