import { useDeferredValue, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Notification from "@/components/ui/Notification/Notification";
import s from "./MobileSheet.module.scss";

export default function MobileSheet({
  open,
  leaks,
  mainLocations = [],
  mainLocationLabel,
  enabledMainLocations = {},
  onToggleMainLocation,
  locations,
  locationLabel,
  enabledLocations,
  onToggleLocation,
  onClose,
  onSelect,
}) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [notification, setNotification] = useState(null);
  const dialogRef = useModalDialog({ open, onClose });
  const noLabel = lang === "ru" ? "Не указано" : "Not specified";

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
            aria-label={
              lang === "ru"
                ? "\u0424\u0438\u043b\u044c\u0442\u0440\u044b \u043a\u0430\u0440\u0442\u044b"
                : "Map filters"
            }
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={s.sheetHandle} />

            {mainLocations.length > 0 && (
              <div className={s.stationList}>
                <div className={s.stationTitle}>
                  {lang === "ru" ? "Фильтр по:" : "Filter by:"}{" "}
                  {mainLocationLabel}
                </div>

                {mainLocations.map((location) => {
                  const label = location || noLabel;

                  return (
                    <label
                      key={location || "__empty_main_location__"}
                      className={s.stationItem}
                    >
                      <input
                        type="checkbox"
                        checked={enabledMainLocations[location] ?? true}
                        onChange={() => onToggleMainLocation?.(location)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className={s.stationList}>
              <div className={s.stationTitle}>
                {lang === "ru" ? "Фильтр по:" : "Filter by:"} {locationLabel}
              </div>

              {locations.map((location) => {
                const label = location || noLabel;

                return (
                  <label
                    key={location || "__empty_location__"}
                    className={s.stationItem}
                  >
                    <input
                      type="checkbox"
                      checked={enabledLocations[location] ?? true}
                      onChange={() => onToggleLocation(location)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            <div className={s.sheetSearch}>
              <input
                type="search"
                placeholder={
                  lang === "ru"
                    ? "Поиск по номеру бирки..."
                    : "Search by tag number..."
                }
                value={query}
                aria-label={
                  lang === "ru"
                    ? "Поиск по номеру бирки"
                    : "Search by tag number"
                }
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className={s.sheetList}>
              {filteredLeaks.length === 0 && (
                <div className={s.sheetEmpty}>
                  {lang === "ru" ? "Ничего не найдено" : "Nothing found"}
                </div>
              )}
              {filteredLeaks.map((leak) => (
                <button
                  key={leak.id}
                  type="button"
                  className={s.sheetItem}
                  onClick={() => onSelect(leak)}
                >
                  <span className={s.dot} />
                  {lang === "ru" ? "Бирка №" : "Tag No."} {leak.leak_id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
