import { useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { formatNumber } from "@/utils/locale";
import Icon from "@/components/ui/Icon/Icon";
import Notification from "@/components/ui/Notification/Notification";
import { sliceField, summarizeSurvey } from "@/domain/surveyGroups";
import { useSurvey } from "@/utils/surveyStorage";
import SurveyScreen from "./SurveyScreen";
import s from "./Coverage.module.scss";

/**
 * Охват обследования (4b): общий процент и разбивка по группам разреза —
 * сколько осмотрено, сколько утечек и сколько их на осмотренный объект.
 * «Отметить обследование» открывает ввод (4a).
 */
export default function CoveragePage({
  data = [],
  projectWide = false,
  onBack,
}) {
  const { t, lang } = useLanguage();
  const { activeProject } = useProjectData();
  const [survey, saveSurvey] = useSurvey(activeProject?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [notification, setNotification] = useState(/** @type {any} */ (null));
  const levelKeys = getLocationLevelKeys(
    PROJECT_LOCATION_CONFIG[activeProject?.type],
  );
  const field = sliceField(survey.slice, levelKeys);
  const summary = useMemo(
    () => summarizeSurvey(survey, data, field),
    [survey, data, field],
  );

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />
      <header className={s.header}>
        <div className={s.headerRow}>
          <button
            type="button"
            className={s.back}
            onClick={onBack}
            aria-label={t("leakDetails.back")}
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
          <h1>{t("coverage.title")}</h1>
        </div>
        <div className={s.total}>
          <strong>{summary.percent}%</strong>
          <span>
            {t("coverage.ofObjects", {
              checked: summary.checked,
              total: summary.total,
            })}
          </span>
        </div>
        {projectWide && (
          <p className={s.scopeNote}>{t("coverage.projectWide")}</p>
        )}
        <span
          className={s.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
        >
          <span style={{ width: `${summary.percent}%` }} />
        </span>
      </header>

      <div className={s.body}>
        <h2>{t(`coverage.byGroup.${survey.slice}`)}</h2>
        {summary.groups.length === 0 ? (
          <p className={s.empty}>{t("coverage.empty")}</p>
        ) : (
          summary.groups.map((group) => (
            <article key={group.id} className={s.group}>
              <div className={s.groupHead}>
                <strong>{group.name}</strong>
                <span>
                  {group.checked} / ~{group.total}
                </span>
              </div>
              <span className={s.bar}>
                <span style={{ width: `${group.percent}%` }} />
              </span>
              <div className={s.chips}>
                <span className={group.leaks ? s.chipLeaks : s.chip}>
                  {t("coverage.leaks", { count: group.leaks })}
                </span>
                {group.rate !== null && (
                  <span className={s.chip}>
                    {t("coverage.rate", {
                      value: formatNumber(
                        group.rate,
                        { maximumFractionDigits: 2 },
                        lang,
                      ),
                    })}
                  </span>
                )}
              </div>
            </article>
          ))
        )}
        <p className={s.hint}>{t("coverage.estimateHint")}</p>
      </div>

      <footer className={s.footer}>
        <button
          type="button"
          className={s.primary}
          onClick={() => setEditing(true)}
        >
          <Icon name="plus" size={20} strokeWidth={2.2} />
          {t("coverage.record")}
        </button>
      </footer>

      {editing && (
        <SurveyScreen
          survey={survey}
          leaks={data}
          levelKeys={levelKeys}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            saveSurvey(next);
            setEditing(false);
            setNotification({ type: "success", message: t("coverage.saved") });
          }}
        />
      )}
    </div>
  );
}
