import { useId } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./ImportConflictSheet.module.scss";

function pluralRecords(count, lang) {
  if (lang !== "ru") return count === 1 ? "record" : "records";
  if (count % 10 === 1 && count % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "записи";
  }
  return "записей";
}

function getChangedFieldLabel(key, lang, t) {
  const explicit = {
    monitoringRecords:
      lang === "ru" ? "История мониторинга" : "Monitoring history",
    history: lang === "ru" ? "История изменений" : "Change history",
  };
  return (
    explicit[key] ?? t(`addLeak.fields.${key}.label`, { defaultValue: key })
  );
}

export default function ImportConflictSheet({
  open,
  projectName,
  existingProject,
  leakCount,
  mergePreview,
  sourceLabel,
  photoLabel,
  onOverwrite,
  onMerge,
  onCopy,
  onCancel,
}) {
  const { lang, t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ open, onClose: onCancel });
  const source = sourceLabel ?? (lang === "ru" ? "в архиве" : "in archive");
  const photos =
    photoLabel ?? (lang === "ru" ? "Фото архива" : "Archive photos");
  const photoStats = mergePreview?.photoStats ?? mergePreview?.excelPhotos;

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.handle} />
        <div className={s.icon}>⚠️</div>
        <h3 id={titleId} className={s.title}>
          {lang === "ru" ? "Проект уже существует" : "Project already exists"}
        </h3>
        <p className={s.description}>
          {lang === "ru"
            ? `«${projectName}» уже есть в приложении`
            : `"${projectName}" already exists in the app`}
          <span className={s.counts}>
            {existingProject?.leakCount ?? 0}{" "}
            {pluralRecords(existingProject?.leakCount ?? 0, lang)} → {leakCount}{" "}
            {source}
          </span>
        </p>
        {mergePreview && (
          <div className={s.previewWrap}>
            <div className={s.preview}>
              <div className={s.previewItem}>
                <span>{lang === "ru" ? "Добавится" : "Added"}</span>
                <strong>{mergePreview.added}</strong>
              </div>
              <div className={s.previewItem}>
                <span>{lang === "ru" ? "Обновится" : "Updated"}</span>
                <strong>{mergePreview.updated}</strong>
              </div>
              <div className={s.previewItem}>
                <span>{lang === "ru" ? "Пропустится" : "Skipped"}</span>
                <strong>{mergePreview.skipped}</strong>
              </div>
              {photoStats ? (
                <>
                  <div className={s.previewItem}>
                    <span>{lang === "ru" ? "Фото новых" : "New photos"}</span>
                    <strong>{photoStats.added}</strong>
                  </div>
                  <div className={s.previewItem}>
                    <span>
                      {lang === "ru" ? "Фото на замену" : "Replaced photos"}
                    </span>
                    <strong>{photoStats.replaced}</strong>
                  </div>
                  <div className={s.previewItem}>
                    <span>
                      {lang === "ru" ? "Фото уже есть" : "Reused photos"}
                    </span>
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
                <span>
                  {lang === "ru" ? "Изменённые поля" : "Changed fields"}
                </span>
                <strong>{mergePreview.changedFields ?? 0}</strong>
              </div>
            </div>
            {(Object.keys(mergePreview.changedFieldBreakdown ?? {}).length >
              0 ||
              Object.keys(photoStats?.replacedByField ?? {}).length > 0) && (
              <details className={s.diagnostics}>
                <summary>
                  {lang === "ru" ? "Что отличается" : "Difference details"}
                </summary>
                {Object.entries(mergePreview.changedFieldBreakdown ?? {}).map(
                  ([key, count]) => (
                    <span key={`field-${key}`}>
                      {getChangedFieldLabel(key, lang, t)}: {count}
                    </span>
                  ),
                )}
                {Object.entries(photoStats?.replacedByField ?? {}).map(
                  ([key, count]) => (
                    <span key={`photo-${key}`}>
                      {lang === "ru" ? "фото" : "photo"} {key}: {count}
                    </span>
                  ),
                )}
                {(photoStats?.replacedByReason?.unreadable ?? 0) > 0 && (
                  <span>
                    {lang === "ru"
                      ? "локальное фото не прочитано"
                      : "local photo could not be read"}
                    : {photoStats.replacedByReason.unreadable}
                  </span>
                )}
                {(photoStats?.replacedByReason?.different ?? 0) > 0 && (
                  <span>
                    {lang === "ru"
                      ? "содержимое фото отличается"
                      : "photo content differs"}
                    : {photoStats.replacedByReason.different}
                  </span>
                )}
              </details>
            )}
          </div>
        )}
        <div className={s.actions}>
          <button className={`${s.btn} ${s.danger}`} onClick={onOverwrite}>
            {lang === "ru" ? "Перезаписать" : "Overwrite"}
          </button>
          <button className={`${s.btn} ${s.neutral}`} onClick={onMerge}>
            {lang === "ru" ? "Объединить" : "Merge"}
          </button>
          <button className={`${s.btn} ${s.neutral}`} onClick={onCopy}>
            {lang === "ru" ? "Создать копию" : "Create copy"}
          </button>
          <button className={`${s.btn} ${s.btnCancel}`} onClick={onCancel}>
            {lang === "ru" ? "Отмена" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
