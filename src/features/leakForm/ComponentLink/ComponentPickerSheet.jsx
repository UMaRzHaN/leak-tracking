import { useEffect, useMemo, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useLanguage } from "@/app/hooks/useLanguage";
import { ComponentRepository } from "@/repositories/ComponentRepository";
import { getDistanceMeters } from "@/utils/geoUtils";
import { hasCoordsFix, readCoordsFix } from "@/utils/coordsFix";
import { logger } from "@/utils/logger";
import s from "./ComponentPickerSheet.module.scss";

/**
 * Выбор карточки компонента для утечки.
 *
 * Ближние сверху, а не «только ближние». Обходчик стоит у железа, и нужная
 * карточка почти всегда в двух шагах — поэтому порядок по расстоянию. Но
 * жёсткий круг здесь был бы вреден: под навесом и между баками фикс уезжает на
 * десятки метров, и отбор спрятал бы ровно ту карточку, за которой пришли.
 * Расстояние показано у каждой строки, так что «не та» видно сразу.
 *
 * Карточки без координат уходят вниз, но не исчезают: их заводили, когда
 * приёмник молчал, и это не повод не находить их поиском.
 *
 * Читает реестр сам: грузится этот лист динамически, поэтому
 * `ComponentRepository` со всем мостом Capacitor в стартовый граф не попадает.
 */

const FAR_AWAY_M = 10_000;

function matches(component, needle) {
  if (!needle) return true;
  return [
    component.component_uid,
    component.component,
    component.scheme_tag,
    component.location,
    component.object,
  ].some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}

export default function ComponentPickerSheet({
  project,
  coords = null,
  onPick,
  onClose,
}) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog({ open: true, onClose });
  const [components, setComponents] = useState(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    ComponentRepository.load(project)
      .then((loaded) => {
        if (!cancelled) setComponents(loaded);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.warn("[componentLink] реестр не прочитался:", error);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const hasGps = hasCoordsFix(coords);

  /** Расстояние до каждой карточки — считается один раз на список. */
  const measured = useMemo(() => {
    if (!components) return [];
    const fix = readCoordsFix(coords);
    return components.map((component) => {
      if (!hasGps) return { component, meters: null };
      const meters = getDistanceMeters(
        fix.lat,
        fix.lng,
        component.lat,
        component.lng,
      );
      return {
        component,
        meters: Number.isFinite(meters) ? meters : null,
      };
    });
  }, [components, coords, hasGps]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const found = measured.filter((row) => matches(row.component, needle));
    if (!hasGps) return found;
    // Без расстояния — вниз, но в списке: такие карточки заводили без фикса.
    return [...found].sort((a, b) => {
      if (a.meters == null) return b.meters == null ? 0 : 1;
      if (b.meters == null) return -1;
      return a.meters - b.meters;
    });
  }, [hasGps, measured, search]);

  function distanceLabel(meters) {
    if (meters == null) return t("leakForm.componentLink.noCoords");
    if (meters > FAR_AWAY_M) return t("leakForm.componentLink.farAway");
    return t("leakForm.componentLink.metersAway", { v1: Math.round(meters) });
  }

  return (
    <div className={s.overlay}>
      <div className={s.backdrop} onClick={onClose} />
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("leakForm.componentLink.title")}
        tabIndex={-1}
      >
        <header className={s.head}>
          <h2>{t("leakForm.componentLink.title")}</h2>
          <p>
            {hasGps
              ? t("leakForm.componentLink.nearestFirst")
              : t("leakForm.componentLink.noFix")}
          </p>
        </header>

        <div className={s.searchRow}>
          <label className={s.searchLabel} htmlFor="component-link-search">
            {t("leakForm.componentLink.searchLabel")}
          </label>
          <input
            id="component-link-search"
            className={s.search}
            type="text"
            value={search}
            placeholder={t("leakForm.componentLink.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {failed && (
          <p className={s.state}>{t("leakForm.componentLink.failed")}</p>
        )}
        {!failed && components === null && (
          <p className={s.state}>{t("leakForm.componentLink.loading")}</p>
        )}
        {!failed && components?.length === 0 && (
          <p className={s.state}>{t("leakForm.componentLink.empty")}</p>
        )}
        {!failed && components?.length > 0 && visible.length === 0 && (
          <p className={s.state}>{t("leakForm.componentLink.nothingFound")}</p>
        )}

        {visible.length > 0 && (
          <ul className={s.list}>
            {visible.map(({ component, meters }) => (
              <li key={component.id}>
                <button
                  type="button"
                  className={s.option}
                  onClick={() => onPick(component)}
                >
                  <span className={s.uid}>№{component.component_uid}</span>
                  <span className={s.name}>
                    {component.component || t("leakForm.componentLink.unnamed")}
                  </span>
                  <span className={s.meta}>
                    {component.scheme_tag ? `${component.scheme_tag} · ` : ""}
                    {hasGps ? distanceLabel(meters) : component.location}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
