import { useMemo } from "react";
import { buildRepairAnalytics } from "@/domain/repairAnalytics";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MainPage/MainPage.module.scss";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Ниже суток незакрытая починка новостью не является.
 *
 * Строка существует, чтобы заметить ремонт, который висит и о котором забыли.
 * Начатый двадцать минут назад под это не подходит — он просто идёт, и о нём
 * уже сказано числом «идёт» рядом.
 */
const STALE_REPAIR = DAY;

/** Столько записей помещается в блок, не превращая главную в список. */
const RETURNED_SHOWN = 3;

/**
 * Длительность коротко: «3 дн» или «5 ч».
 *
 * Сокращения, а не полные слова, — как в остальном приложении: русский требует
 * трёх форм множественного числа там, где английскому хватает двух, и ради
 * подписи в две цифры это лишний повод разойтись переводам.
 */
function formatDuration(ms, t) {
  if (ms == null) return null;
  if (ms >= DAY) {
    return t("mainPage.repairs.days", { count: Math.round(ms / DAY) });
  }
  if (ms >= HOUR) {
    return t("mainPage.repairs.hours", { count: Math.round(ms / HOUR) });
  }
  // Не округляется вверх до часа: починка, занявшая три минуты, объявленная
  // часовой, врёт ровно в той цифре, ради которой строку и читают.
  return t("mainPage.repairs.minutes", {
    count: Math.max(1, Math.round(ms / MINUTE)),
  });
}

/**
 * Что стало с ремонтами по проекту.
 *
 * Блока не было, пока ремонт лежал на записи одиночными полями: вторая попытка
 * затирала первую, и вернувшаяся утечка ничем не отличалась от починенной с
 * первого раза. Здесь видно ровно то, что до сих пор приходилось держать в
 * голове, — к какому железу придётся идти второй раз.
 */
export default function RepairAnalytics({ leaks, onOpenLeak }) {
  const { t } = useLanguage();
  const summary = useMemo(() => buildRepairAnalytics(leaks), [leaks]);

  // Проект, где ещё ничего не чинили, не должен видеть пустую рамку с нулями.
  if (summary.repairedLeaks === 0) return null;

  const median = formatDuration(summary.medianDuration, t);
  const longestOpen =
    summary.longestOpenRepair != null &&
    summary.longestOpenRepair >= STALE_REPAIR
      ? formatDuration(summary.longestOpenRepair, t)
      : null;
  const shown = summary.returnedLeaks.slice(0, RETURNED_SHOWN);
  const hidden = summary.returnedLeaks.length - shown.length;

  return (
    <section className={s.repairs} aria-label={t("mainPage.repairs.title")}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{t("mainPage.repairs.title")}</h2>
      </div>

      <div className={s.repairStats}>
        <div className={s.repairStat} data-tone="progress">
          <span className={s.repairStatValue}>{summary.inProgress}</span>
          <span className={s.repairStatLabel}>
            {t("mainPage.repairs.inProgress")}
          </span>
        </div>
        <div className={s.repairStat} data-tone="open">
          <span className={s.repairStatValue}>{summary.returned}</span>
          <span className={s.repairStatLabel}>
            {t("mainPage.repairs.returned")}
          </span>
        </div>
        <div className={s.repairStat} data-tone="resolved">
          <span className={s.repairStatValue}>{summary.completed}</span>
          <span className={s.repairStatLabel}>
            {t("mainPage.repairs.completed")}
          </span>
        </div>
      </div>

      {(median || longestOpen) && (
        <p className={s.repairNote}>
          {median && t("mainPage.repairs.median", { value: median })}
          {median && longestOpen && " · "}
          {longestOpen &&
            t("mainPage.repairs.longestOpen", { value: longestOpen })}
        </p>
      )}

      {shown.length > 0 && (
        <>
          <h3 className={s.repairListTitle}>
            {t("mainPage.repairs.returnedTitle")}
          </h3>
          <ul className={s.repairList}>
            {shown.map(({ leak, attempts }) => (
              <li key={leak.id}>
                <button
                  type="button"
                  className={s.repairItem}
                  onClick={() => onOpenLeak?.(leak)}
                >
                  <span className={s.repairItemText}>
                    <strong>
                      {leak.leak_id || t("mainPage.repairs.noTag")}
                    </strong>
                    {leak.component && <span> · {leak.component}</span>}
                  </span>
                  <span
                    className={s.repairAttempts}
                    aria-label={t("mainPage.repairs.attempts", {
                      count: attempts,
                    })}
                  >
                    ×{attempts}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className={s.repairNote}>
              {t("mainPage.repairs.more", { count: hidden })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
