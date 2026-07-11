import { useLanguage } from "@/app/hooks/useLanguage";
import RecentLeakItem from "./RecentLeaksItem";
import s from "./RecentLeaks.module.scss";

export default function RecentLeaks({
  leaks = [],
  onViewAll,
  onOpenDetails,
  setPage,
  onRemove,
}) {
  const { t } = useLanguage();

  return (
    <div className={s.recentLeaks}>
      <div className={s.recentHeader}>
        <h3 className={s.title}>
          {t("recentLeaks.title", { defaultValue: "Recent" })}
        </h3>
        <button className={s.viewAll} onClick={onViewAll}>
          {t("recentLeaks.viewAll", { defaultValue: "Show all ->" })}
        </button>
      </div>

      <div className={s.leakList}>
        {leaks.length ? (
          leaks.map((leak) => (
            <RecentLeakItem
              key={leak.id}
              leak={leak}
              onOpenDetails={onOpenDetails}
              onRemove={onRemove}
            />
          ))
        ) : (
          <div className={s.emptyRecent}>
            <div className={s.emptyRecentTitle}>
              {t("recentLeaks.emptyTitle", {
                defaultValue: "No leaks added yet",
              })}
            </div>

            <div className={s.emptyRecentHint}>
              {t("recentLeaks.emptyHint", {
                defaultValue: "Add the first record so it appears here.",
              })}
            </div>

            <button
              className={s.emptyRecentLink}
              onClick={() => setPage("add")}
            >
              {t("recentLeaks.addFirst", {
                defaultValue: "+ Add first leak",
              })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
