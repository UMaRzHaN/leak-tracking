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
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [notification, setNotification] = useState(null);
  const dialogRef = useModalDialog({ open, onClose });
  const noLabel = t("map.sheet.notSpecified");

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

            {mainLocations.length > 0 && (
              <div className={s.stationList}>
                <div className={s.stationTitle}>
                  {t("map.sheet.filterBy")} {mainLocationLabel}
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
                {t("map.sheet.filterBy")} {locationLabel}
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
                  {t("map.popup.tag")} {leak.leak_id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
