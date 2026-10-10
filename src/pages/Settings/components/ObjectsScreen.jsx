import { useId, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import { objectsUnder, projectObjectLevel } from "../projectObjects";
import s from "../Settings.module.scss";

/**
 * Объекты и кусты (11c) по уровням места: сначала первый уровень со
 * счётчиками, по тапу — следующий, и так до самих объектов. «Назад»
 * поднимает на уровень выше. Поиск ищет объекты сразу по всему проекту.
 * Объект появляется вместе с первой записью — это то же дерево, что в
 * выборе места в шапке.
 *
 * @param {{ objects: Array<{ key: string, name: string, parents: string[], path: string, count: number }>,
 *   onClose: () => void }} props
 */
/** По алфавиту (номера по порядку) или по числу записей. */
function sortRows(rows, byName) {
  return [...rows].sort((left, right) =>
    byName
      ? left.name.localeCompare(right.name, undefined, { numeric: true })
      : right.count - left.count,
  );
}

export default function ObjectsScreen({ objects, onClose }) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose });
  const [query, setQuery] = useState("");
  const [byName, setByName] = useState(true);
  // Путь по уровням: [] — первый уровень, дальше — выбранные папки.
  const [trail, setTrail] = useState(/** @type {string[]} */ ([]));
  const needle = query.trim().toLocaleLowerCase();
  const scoped = useMemo(() => objectsUnder(objects, trail), [objects, trail]);
  const total = scoped.reduce((sum, object) => sum + object.count, 0);
  // Папки текущего уровня; null — дошли до объектов.
  const level = useMemo(
    () => (needle ? null : projectObjectLevel(objects, trail)),
    [objects, trail, needle],
  );
  const shownGroups = useMemo(
    () => (level ? sortRows(level, byName) : []),
    [level, byName],
  );
  // Объекты на экране: найденные по всему проекту или объекты под путём.
  const shown = useMemo(() => {
    if (needle) {
      return sortRows(
        objects.filter((object) =>
          `${object.name} ${object.path}`.toLocaleLowerCase().includes(needle),
        ),
        byName,
      );
    }
    return level ? null : sortRows(scoped, byName);
  }, [objects, needle, level, scoped, byName]);
  const inside = trail.length > 0 && !needle;
  const unnamed = (value) => value || t("locationScope.unnamed");

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
            onClick={() =>
              inside ? setTrail((path) => path.slice(0, -1)) : onClose()
            }
            aria-label={t("leakDetails.back")}
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
          <div>
            <p className={s.groupCaption}>
              {inside
                ? trail.length > 1
                  ? unnamed(trail[trail.length - 2])
                  : t("settings.objects.title")
                : t("settings.objects.caption")}
            </p>
            <h1 id={titleId}>
              {inside
                ? unnamed(trail[trail.length - 1])
                : t("settings.objects.title")}
            </h1>
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
              objects: needle ? objects.length : scoped.length,
              points: needle
                ? objects.reduce((sum, object) => sum + object.count, 0)
                : total,
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

        {shown === null ? (
          <div className={s.groupCard}>
            {shownGroups.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${s.groupRow} ${s.groupRowButton}`}
                onClick={() => setTrail((path) => [...path, item.key])}
              >
                <span className={s.groupRowText}>
                  <strong>{unnamed(item.name)}</strong>
                  <small>
                    {t("settings.objects.count", { count: item.objects })}
                  </small>
                </span>
                <span className={s.objectsCount}>
                  {t("settings.objects.points", { count: item.count })}
                </span>
                <Icon name="chevronRight" size={16} strokeWidth={2} />
              </button>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className={s.groupHint}>{t("settings.objects.empty")}</p>
        ) : (
          <div className={s.groupCard}>
            {shown.map((object) => (
              <div key={object.key} className={s.groupRow}>
                <span className={s.groupRowText}>
                  <strong>{object.name}</strong>
                  {/* Внутри уровня путь — в заголовке; подпись нужна только
                      найденному поиском. */}
                  {needle && object.path && <small>{object.path}</small>}
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
