import { useId, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import s from "../Settings.module.scss";

/**
 * Объекты и кусты (11c): последний уровень места со всеми, что над ним, и
 * сколько записей на каждом. Объект появляется вместе с первой записью — это
 * то же дерево, что в выборе места в шапке, только развёрнутое списком.
 *
 * @param {{ objects: Array<{ key: string, name: string, path: string, count: number }>,
 *   onClose: () => void }} props
 */
export default function ObjectsScreen({ objects, onClose }) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose });
  const [query, setQuery] = useState("");
  const [byName, setByName] = useState(true);

  const total = objects.reduce((sum, object) => sum + object.count, 0);
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return objects
      .filter(
        (object) =>
          !needle ||
          `${object.name} ${object.path}`.toLocaleLowerCase().includes(needle),
      )
      .sort((left, right) =>
        byName
          ? left.name.localeCompare(right.name, undefined, { numeric: true })
          : right.count - left.count,
      );
  }, [objects, query, byName]);

  return (
    <div
      ref={dialogRef}
      className={s.objectsScreen}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className={s.objectsHeader}>
        <div className={s.objectsHeaderRow}>
          <button
            type="button"
            className={s.objectsBack}
            onClick={onClose}
            aria-label={t("leakDetails.back")}
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
          <div>
            <p className={s.groupCaption}>{t("settings.objects.caption")}</p>
            <h1 id={titleId}>{t("settings.objects.title")}</h1>
          </div>
        </div>
        <label className={s.objectsSearch}>
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("settings.objects.search")}
            aria-label={t("settings.objects.search")}
          />
        </label>
      </header>

      <div className={s.objectsBody}>
        <div className={s.objectsSummary}>
          <span className={s.groupCaption}>
            {t("settings.objects.summary", {
              objects: objects.length,
              points: total,
            })}
          </span>
          <button
            type="button"
            className={s.objectsSort}
            onClick={() => setByName((value) => !value)}
          >
            {byName
              ? t("settings.objects.byName")
              : t("settings.objects.byCount")}
          </button>
        </div>

        {shown.length === 0 ? (
          <p className={s.groupHint}>{t("settings.objects.empty")}</p>
        ) : (
          <div className={s.groupCard}>
            {shown.map((object) => (
              <div key={object.key} className={s.groupRow}>
                <span className={s.groupRowText}>
                  <strong>{object.name}</strong>
                  {object.path && <small>{object.path}</small>}
                </span>
                <span className={s.objectsCount}>
                  {t("settings.objects.points", { count: object.count })}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className={s.groupHint}>{t("settings.objects.hint")}</p>
      </div>
    </div>
  );
}
