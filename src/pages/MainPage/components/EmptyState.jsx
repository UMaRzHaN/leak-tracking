import s from "@/pages/MainPage/MainPage.module.scss";
import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";

export default function EmptyState({ setPage, hasFilter }) {
  const { t } = useLanguage();

  const localeTexts = useMemo(
    () => ({
      noRecords: t("emptyState.noRecords"),
      noFilteredRecords: t("emptyState.noFilteredRecords"),
      addFirstLeak: t("emptyState.addFirstLeak"),
      addLeak: t("emptyState.addLeak"),
    }),
    [t],
  );
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{hasFilter ? "🔍" : "📋"}</span>
      <p className={s.emptyTitle}>
        {hasFilter ? localeTexts.noFilteredRecords : localeTexts.noRecords}
      </p>
      {!hasFilter && (
        <>
          <p className={s.emptyHint}>{localeTexts.addFirstLeak}</p>
          <button className={s.emptyBtn} onClick={() => setPage("add")}>
            {localeTexts.addLeak}
          </button>
        </>
      )}
    </div>
  );
}
