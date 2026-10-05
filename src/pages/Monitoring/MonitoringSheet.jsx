import { useId } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import {
  MONITORING_RESULT_ORDER,
  getMonitoringAnswerLabel,
} from "@/utils/monitoring";
import { getCurrentMonitoringResult } from "./monitoringDomain";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { normalizeLocationValue } from "@/utils/locationFilter";
import Icon from "@/components/ui/Icon/Icon";
import s from "./Monitoring.module.scss";

/**
 * Проверка утечки на весь экран (5c). Раньше это была шторка поверх списка:
 * пять полей и фото в ней прокручивались под пальцем у края экрана, а кнопка
 * сохранения уезжала вниз. Теперь шапка и кнопка закреплены, между ними —
 * форма.
 */

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
  const titleId = useId();
  const { project } = useProjectData();
  // Под заголовком — где утечка: два нижних уровня места, как в карточке.
  const place = getLocationLevelKeys(PROJECT_LOCATION_CONFIG[project])
    .slice(-2)
    .map((key) => normalizeLocationValue(leak?.[key]))
    .filter(Boolean);
  const subtitle = [
    `${texts.leakNumber} ${leak?.leak_id ?? leak?.index ?? "—"}`,
    ...place,
  ].join(" · ");
  const dialogRef = useModalDialog({
    onClose,
    closeDisabled: saving,
  });

  return (
    <div
      ref={dialogRef}
      className={s.checkScreen}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className={s.checkHeader}>
        <button
          type="button"
          className={s.checkClose}
          onClick={onClose}
          disabled={saving}
          aria-label={texts.close}
        >
          <Icon name="close" size={20} strokeWidth={2} />
        </button>
        <div className={s.checkTitleBlock}>
          <div className={s.sheetTitleRow}>
            <h2 id={titleId}>{texts.checkTitle}</h2>
            {progress && progress.total > 1 && (
              <span className={s.progressBadge}>
                {progress.current} / {progress.total}
              </span>
            )}
          </div>
          <p>{subtitle}</p>
        </div>
      </header>

      <div className={s.checkBody}>
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

        <div className={s.fieldRow}>
          {[
            ["physicalTag", texts.physicalTag],
            ["fiction", texts.fiction],
          ].map(([key, label]) => (
            <label key={key} className={s.field}>
              <span>{label}</span>
              <select
                value={draft[key] ? "yes" : "no"}
                onChange={(event) =>
                  onChange({ [key]: event.target.value === "yes" })
                }
              >
                <option value="yes">{texts.yes}</option>
                <option value="no">{texts.no}</option>
              </select>
            </label>
          ))}
        </div>

        {/* МТР по факту — пока свободным текстом. Выбор из накладных
            (переключатель «Приёмка / Заказчик» в макете) придёт с модулем
            ремонтов: без приёмки МТР выбирать не из чего. */}
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

        <label className={s.field}>
          <span>{texts.comment}</span>
          <textarea
            value={draft.comment}
            onChange={(event) => onChange({ comment: event.target.value })}
            placeholder={texts.commentPlaceholder}
            rows={3}
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
      </div>

      <footer className={s.checkFooter}>
        <button
          type="button"
          className={s.saveBtn}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? texts.saving : texts.saveCheck}
        </button>
      </footer>
    </div>
  );
}
