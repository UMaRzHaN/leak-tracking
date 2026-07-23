import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import {
  MONITORING_RESULT_ORDER,
  getMonitoringAnswerLabel,
} from "@/utils/monitoring";
import { getCurrentMonitoringResult } from "./monitoringDomain";
import s from "./Monitoring.module.scss";

export default function MonitoringSheet({
  leak,
  draft,
  texts,
  lang,
  progress,
  submitted,
  saving,
  photoRequired,
  onChange,
  onSave,
  onClose,
}) {
  return (
    <div className={s.sheetOverlay} onClick={saving ? undefined : onClose}>
      <div className={s.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={s.sheetHandle} />
        <div className={s.sheetHeader}>
          <div className={s.sheetTitleBlock}>
            <div className={s.sheetTitleRow}>
              <h2>{texts.check}</h2>
              {progress && progress.total > 1 && (
                <span className={s.progressBadge}>
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>
            <p>
              {texts.leakNumber} {leak?.leak_id ?? leak?.index ?? "—"}
            </p>
          </div>
          <button
            type="button"
            className={s.sheetCloseBtn}
            onClick={onClose}
            disabled={saving}
          >
            {texts.close}
          </button>
        </div>

        <label className={s.field}>
          <span>{texts.result}</span>
          <select
            value={draft.result}
            onChange={(event) => onChange({ result: event.target.value })}
          >
            {MONITORING_RESULT_ORDER.map((result) => {
              const current = result === getCurrentMonitoringResult(leak);
              const label = getMonitoringAnswerLabel(result, lang);
              return (
                <option key={result} value={result}>
                  {current ? `${label} (${texts.currentState})` : label}
                </option>
              );
            })}
          </select>
        </label>

        <label className={s.field}>
          <span>{texts.comment}</span>
          <textarea
            value={draft.comment}
            onChange={(event) => onChange({ comment: event.target.value })}
            placeholder={texts.commentPlaceholder}
            rows={2}
          />
        </label>

        <label className={s.field}>
          <span>{texts.materials}</span>
          <textarea
            value={draft.materials_equipment ?? ""}
            onChange={(event) =>
              onChange({ materials_equipment: event.target.value })
            }
            placeholder={texts.materialsPlaceholder}
            rows={2}
          />
        </label>

        <PhotoInput
          value={draft.photo}
          onChange={(photo) => onChange({ photo })}
          label={texts.photo}
          required={photoRequired}
          compact
          error={photoRequired && submitted && !draft.photo?.raw}
        />

        <button
          type="button"
          className={s.saveBtn}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? texts.saving : texts.save}
        </button>
      </div>
    </div>
  );
}
