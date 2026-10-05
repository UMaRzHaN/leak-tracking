import s from "@/pages/MainPage/MainPage.module.scss";
import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";

export default function EmptyState({ setPage }) {
  const { t } = useLanguage();

  const localeTexts = useMemo(
    () => ({
      noRecords: t("emptyState.noRecords"),
      addFirstLeak: t("emptyState.addFirstLeak"),
      addLeak: t("emptyState.addLeak"),
    }),
    [t],
  );
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>📋</span>
      <p className={s.emptyTitle}>{localeTexts.noRecords}</p>
      <p className={s.emptyHint}>{localeTexts.addFirstLeak}</p>
      <button className={s.emptyBtn} onClick={() => setPage("add")}>
        {localeTexts.addLeak}
      </button>
    </div>
  );
}
