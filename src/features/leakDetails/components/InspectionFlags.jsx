import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./InspectionFlags.module.scss";

/**
 * Ответы осмотра на вопросы «физ. тег есть?» и «фикция?» — у осмотра
 * мониторинга и у проверки ремонта, которая про тег тоже спрашивает.
 *
 * Тег показывается в обе стороны, когда о нём спросили: «нет» — повод
 * вешать бирку, «есть» — что её видели. Фикция — только «да»: «не фикция»
 * ставится каждому обычному осмотру и повторялась бы под каждым.
 * У записей, где вопроса ещё не было, поля нет — и плашки тоже.
 */
export default function InspectionFlags({ physicalTag, fiction }) {
  const { t } = useLanguage();
  const hasTag = typeof physicalTag === "boolean";
  if (!hasTag && fiction !== true) return null;

  return (
    <div className={s.flags}>
      {hasTag && (
        <span className={s.flag} data-tone={physicalTag ? "ok" : "warn"}>
          {physicalTag
            ? t("leakDetails.flags.tagPresent")
            : t("leakDetails.flags.tagMissing")}
        </span>
      )}
      {fiction === true && (
        <span className={s.flag} data-tone="fiction">
          {t("leakDetails.flags.fiction")}
        </span>
      )}
    </div>
  );
}
