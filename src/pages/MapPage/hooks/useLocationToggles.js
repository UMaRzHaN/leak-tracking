import { useCallback, useEffect, useMemo } from "react";
import {
  buildLocationFilterFromEnabled,
  buildSmartLocationSelection,
  getEnabledLocations,
  normalizeLocationValue,
} from "@/utils/locationFilter";

/**
 * Списки локаций карты и переключение их галочек.
 *
 * Отделено от остального отбора: там решают, какие утечки показать, а здесь
 * только про два уровня локаций — какие вообще есть, какие включены и что
 * происходит по нажатию. Третий уровень сюда не входит: у карты нет списка
 * для него, она лишь уважает выбранное в обозревателе локаций.
 */
export function useLocationToggles({
  locationFilter,
  locationKey,
  locations,
  mainLocationFilter,
  mainLocationKey,
  normalizedLeaks,
  setLocationFilter,
  setMainLocationFilter,
  sharedSearch,
}) {
  const mainLocations = useMemo(
    () =>
      Array.from(
        new Set(
          normalizedLeaks.map((leak) =>
            normalizeLocationValue(leak?.[mainLocationKey]),
          ),
        ),
      ),
    [mainLocationKey, normalizedLeaks],
  );
  const enabledMainLocations = useMemo(
    () =>
      getEnabledLocations(mainLocations, mainLocationKey, mainLocationFilter),
    [mainLocationFilter, mainLocationKey, mainLocations],
  );
  const enabledLocations = useMemo(
    () => getEnabledLocations(locations, locationKey, locationFilter),
    [locationFilter, locationKey, locations],
  );

  useEffect(() => {
    const selection = buildSmartLocationSelection(locations, sharedSearch);
    if (!selection) return;
    setLocationFilter(
      buildLocationFilterFromEnabled(locations, locationKey, selection),
    );
  }, [locationKey, locations, setLocationFilter, sharedSearch]);

  const toggleMainLocation = useCallback(
    (location) => {
      setMainLocationFilter((current) => {
        const currentEnabled = getEnabledLocations(
          mainLocations,
          mainLocationKey,
          current,
        );
        const nextEnabled = {
          ...currentEnabled,
          [location]: !currentEnabled[location],
        };
        return buildLocationFilterFromEnabled(
          mainLocations,
          mainLocationKey,
          nextEnabled,
        );
      });
    },
    [mainLocationKey, mainLocations, setMainLocationFilter],
  );

  const toggleLocation = useCallback(
    (location) => {
      setLocationFilter((current) => {
        const currentEnabled = getEnabledLocations(
          locations,
          locationKey,
          current,
        );
        const nextEnabled = {
          ...currentEnabled,
          [location]: !currentEnabled[location],
        };
        return buildLocationFilterFromEnabled(
          locations,
          locationKey,
          nextEnabled,
        );
      });
    },
    [locationKey, locations, setLocationFilter],
  );

  return {
    enabledLocations,
    enabledMainLocations,
    mainLocations,
    toggleLocation,
    toggleMainLocation,
  };
}
