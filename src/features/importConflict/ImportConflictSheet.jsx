import { useEffect, useId, useRef, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useLanguage } from "@/app/hooks/useLanguage";
import { fieldLabel } from "@/utils/fieldLabels";
import s from "./ImportConflictSheet.module.scss";

// Russian needs three plural forms where English needs two, and picking
// between them is what Intl.PluralRules is for — the locale carries every form
// its language can select, so this stays free of per-language branching.
function pluralRecords(count, t, intlLocale) {
  const form = new Intl.PluralRules(intlLocale).select(count);
  return t(`importConflict.records.${form}`);
}

// `monitoringRecords` and `history` are not form fields, so they have no entry
// under `addLeak.fields`; the merge preview counts them all the same.
const DIAGNOSTIC_FIELD_KEYS = new Set(["monitoringRecords", "history"]);

function getChangedFieldLabel(key, t) {
  return DIAGNOSTIC_FIELD_KEYS.has(key)
    ? t(`importConflict.diagnostics.${key}`)
    : fieldLabel(key, t);
}

export default function ImportConflictSheet({
  open,
  projectName,
  existingProject,
  leakCount,
  mergePreview,
  sourceLabel = null,
  photoLabel = null,
  onOverwrite,
  onMerge,
  onCopy,
  onCancel,
  onActionError = null,
}) {
  const { t, intlLocale } = useLanguage();
  const titleId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const handleCancel = () => {
    if (!pendingRef.current) onCancel?.();
  };
  const dialogRef = useModalDialog({
    open,
    onClose: handleCancel,
    closeDisabled: pending,
  });
  const source = sourceLabel ?? t("importConflict.source");
  const photos = photoLabel ?? t("importConflict.preview.archivePhotos");
  const photoStats = mergePreview?.photoStats ?? mergePreview?.excelPhotos;

  useEffect(() => {
    if (open) return;
    pendingRef.current = false;
    setPending(false);
  }, [open]);

  const runAction = async (action) => {
    if (pendingRef.current || typeof action !== "function") return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } catch (error) {
      onActionError?.(error);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={handleCancel}>
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.handle} />
        <div className={s.icon} aria-hidden="true">
          ⚠️
        </div>
        <h3 id={titleId} className={s.title}>
          {t("importConflict.title")}
        </h3>
        <p id={descriptionId} className={s.description}>
          {t("importConflict.description", { project: projectName })}
          <span className={s.counts}>
            {existingProject?.leakCount ?? 0}{" "}
            {pluralRecords(existingProject?.leakCount ?? 0, t, intlLocale)} →{" "}
            {leakCount} {source}
          </span>
        </p>
        {mergePreview && (
          <div className={s.previewWrap}>
            <div className={s.preview}>
              <div className={s.previewItem}>
                <span>{t("importConflict.preview.added")}</span>
                <strong>{mergePreview.added}</strong>
              </div>
              <div className={s.previewItem}>
                <span>{t("importConflict.preview.updated")}</span>
                <strong>{mergePreview.updated}</strong>
              </div>
              <div className={s.previewItem}>
                <span>{t("importConflict.preview.skipped")}</span>
                <strong>{mergePreview.skipped}</strong>
              </div>
              {photoStats ? (
                <>
                  <div className={s.previewItem}>
                    <span>{t("importConflict.preview.photosAdded")}</span>
                    <strong>{photoStats.added}</strong>
                  </div>
                  <div className={s.previewItem}>
                    <span>{t("importConflict.preview.photosReplaced")}</span>
                    <strong>{photoStats.replaced}</strong>
                  </div>
                  <div className={s.previewItem}>
                    <span>{t("importConflict.preview.photosReused")}</span>
                    <strong>{photoStats.reused}</strong>
                  </div>
                </>
              ) : (
                <div className={s.previewItem}>
                  <span>{photos}</span>
                  <strong>{mergePreview.archivePhotos}</strong>
                </div>
              )}
              <div className={s.previewItem}>
                <span>{t("importConflict.preview.changedFields")}</span>
                <strong>{mergePreview.changedFields ?? 0}</strong>
              </div>
            </div>
            {(Object.keys(mergePreview.changedFieldBreakdown ?? {}).length >
              0 ||
              Object.keys(photoStats?.replacedByField ?? {}).length > 0) && (
              <details className={s.diagnostics}>
                <summary>{t("importConflict.diagnostics.summary")}</summary>
                {Object.entries(mergePreview.changedFieldBreakdown ?? {}).map(
                  ([key, count]) => (
                    <span key={`field-${key}`}>
                      {getChangedFieldLabel(key, t)}: {count}
                    </span>
                  ),
                )}
                {Object.entries(photoStats?.replacedByField ?? {}).map(
                  ([key, count]) => (
                    <span key={`photo-${key}`}>
                      {t("importConflict.diagnostics.photo")} {key}: {count}
                    </span>
                  ),
                )}
                {(photoStats?.replacedByReason?.unreadable ?? 0) > 0 && (
                  <span>
                    {t("importConflict.diagnostics.unreadable")}:{" "}
                    {photoStats.replacedByReason.unreadable}
                  </span>
                )}
                {(photoStats?.replacedByReason?.different ?? 0) > 0 && (
                  <span>
                    {t("importConflict.diagnostics.different")}:{" "}
                    {photoStats.replacedByReason.different}
                  </span>
                )}
              </details>
            )}
          </div>
        )}
        <div className={s.actions}>
          <button
            type="button"
            className={`${s.btn} ${s.danger}`}
            onClick={() => runAction(onOverwrite)}
            disabled={pending}
          >
            {t("importConflict.actions.overwrite")}
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.neutral}`}
            onClick={() => runAction(onMerge)}
            disabled={pending}
          >
            {t("importConflict.actions.merge")}
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.neutral}`}
            onClick={() => runAction(onCopy)}
            disabled={pending}
          >
            {t("importConflict.actions.copy")}
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.btnCancel}`}
            onClick={handleCancel}
            disabled={pending}
          >
            {t("importConflict.actions.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
