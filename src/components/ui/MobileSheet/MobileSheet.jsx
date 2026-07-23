import { useDeferredValue, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import Notification from "@/components/ui/Notification/Notification";
import s from "./MobileSheet.module.scss";

export default function MobileSheet({
  open,
  leaks,
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
            className={`${s.sheet} ${s.open}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={s.sheetHandle} />

            <div className={s.stationList}>
              <div className={s.stationTitle}>
                {lang === "ru" ? "Фильтр по:" : "Filter by:"} {locationLabel}
              </div>

              {locations.map((location) => {
                const label = location || noLabel;

                return (
                  <label key={label} className={s.stationItem}>
                    <input
                      type="checkbox"
                      checked={enabledLocations[label] ?? true}
                      onChange={() => onToggleLocation(label)}
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
                <div
                  key={leak.id}
                  className={s.sheetItem}
                  onClick={() => onSelect(leak)}
                >
                  <span className={s.dot} />
                  {lang === "ru" ? "Бирка №" : "Tag No."} {leak.leak_id}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
