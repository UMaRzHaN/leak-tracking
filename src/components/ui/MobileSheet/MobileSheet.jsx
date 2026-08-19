import { useDeferredValue, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Notification from "@/components/ui/Notification/Notification";
import s from "./MobileSheet.module.scss";

// Location is chosen in the header's folder browser, which writes the same
// three filters this sheet used to toggle. Keeping a second control over them
// would duplicate the logic and let the two drift apart.
export default function MobileSheet({ open, leaks, onClose, onSelect }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [notification, setNotification] = useState(null);
  const dialogRef = useModalDialog({ open, onClose });

  const filteredLeaks = useMemo(() => {
    if (!deferredQuery.trim()) return leaks;
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
    return leaks.filter((leak) =>
      String(leak.leak_id ?? "")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [deferredQuery, leaks]);

  return (
    <>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {open && (
        <div className={s.overlay} onClick={onClose}>
          <div
            ref={dialogRef}
            className={`${s.sheet} ${s.open}`}
            role="dialog"
            aria-modal="true"
            aria-label={t("map.sheet.title")}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={s.sheetHandle} />

            <div className={s.sheetSearch}>
              <input
                type="search"
                placeholder={t("map.sheet.searchPlaceholder")}
                value={query}
                aria-label={t("map.sheet.searchLabel")}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className={s.sheetList}>
              {filteredLeaks.length === 0 && (
                <div className={s.sheetEmpty}>{t("map.sheet.empty")}</div>
              )}
              {filteredLeaks.map((leak) => (
                <button
                  key={leak.id}
                  type="button"
                  className={s.sheetItem}
                  onClick={() => onSelect(leak)}
                >
                  <span className={s.dot} />
                  {/* Тот же список на обеих базах карты, но подписан тем, чем
                      вещь на самом деле является: бирка у утечки, присвоенный
                      номер у компонента. */}
                  {leak.kind === "component"
                    ? t("map.popup.componentTag")
                    : t("map.popup.tag")}{" "}
                  {leak.leak_id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
