import { useCallback, useMemo, useRef, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { getDistanceMeters } from "@/utils/geoUtils";
import { STATUS } from "@/utils/status";
import { readMonitoringRound } from "@/utils/monitoringRound";
import {
  matchesLeakLocationFilter,
  normalizeLocationValue,
} from "@/utils/locationFilter";
import { filterLeaksByMonitoring } from "@/pages/Monitoring/monitoringDomain";
import { normalizeMultiFilter } from "@/pages/DataBase/hooks/useDataBaseFilters";
import {
  FICTION_FILTER,
  MONITORING_FILTER,
  NEARBY_RADIUS_M,
  TAG_FILTER,
} from "@/domain/leakFilters";
import { MAP_FILTER, mapFiltersFor } from "@/pages/MapPage/mapModuleFilters";
import {
  getLastMonitoringFlag,
  isLeakFiction,
  isMonitoringDue,
} from "@/utils/monitoring";

import { useLocationToggles } from "./useLocationToggles";

const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];
// Один и тот же пустой набор: новый массив на каждый рендер сбивал бы мемо.
const NO_FILTER = /** @type {string[]} */ ([]);

export function useMapFilters({
  leaks,
  coords,
  gpsEnabled,
  sharedFilters,
  activeProjectId,
  open,
  mapCenter,
  // Отборы модуля: чего на карте модуля нет, то и не действует.
  filters = mapFiltersFor(),
}) {
  const distanceCacheRef = useRef(new Map());
  const {
    leaks: normalizedLeaks,
    locations,
    main: mainLocationKey,
    mainLabel: mainLocationLabel,
    secondary: locationKey,
    label: locationLabel,
  } = useActiveLocation(leaks);
  const [localNearbyOnly, setLocalNearbyOnly] = useState(false);
  const [localNearbyRadius, setLocalNearbyRadius] = useState(NEARBY_RADIUS_M);
  const [localPriorityFilter, setLocalPriorityFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  const [localStatusFilter, setLocalStatusFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  const [localMainLocationFilter, setLocalMainLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [localLocationFilter, setLocalLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [localFictionFilter, setLocalFictionFilter] = useState(
    FICTION_FILTER.ALL,
  );
  const [localMonitoringFilter, setLocalMonitoringFilter] = useState(
    MONITORING_FILTER.DUE,
  );
  const [localTagFilter, setLocalTagFilter] = useState(TAG_FILTER.ALL);
  const monitoringRound = useMemo(
    () => readMonitoringRound(activeProjectId),
    [activeProjectId],
  );
  const monitoringRoundId = monitoringRound?.id ?? null;
  const monitoringRoundNumber = monitoringRound?.number ?? null;
  const hasMonitoringRound =
    Boolean(monitoringRoundId) && filters.has(MAP_FILTER.MONITORING);

  const nearbyOnly = sharedFilters?.nearbyFilter ?? localNearbyOnly;
  const setNearbyOnly = sharedFilters?.setNearbyFilter ?? setLocalNearbyOnly;
  const nearbyRadius = sharedFilters?.nearbyRadius ?? localNearbyRadius;
  const setNearbyRadius =
    sharedFilters?.setNearbyRadius ?? setLocalNearbyRadius;
  const priorityFilters = filters.has(MAP_FILTER.PRIORITY)
    ? normalizeMultiFilter(sharedFilters?.priorityFilter ?? localPriorityFilter)
    : NO_FILTER;
  const setPriorityFilter =
    sharedFilters?.setPriorityFilter ?? setLocalPriorityFilter;
  const statusFilters = filters.has(MAP_FILTER.STATUS)
    ? normalizeMultiFilter(sharedFilters?.statusFilter ?? localStatusFilter)
    : NO_FILTER;
  const setStatusFilter = sharedFilters?.setFilter ?? setLocalStatusFilter;
  // Общий с базой и мониторингом: выбранное там видно здесь.
  const fictionFilter = filters.has(MAP_FILTER.FICTION)
    ? (sharedFilters?.fictionFilter ?? localFictionFilter)
    : FICTION_FILTER.ALL;
  // Общий с обходом: выбранное в списке видно на карте.
  const tagFilter = sharedFilters?.tagFilter ?? localTagFilter;
  const setTagFilter = sharedFilters?.setTagFilter ?? setLocalTagFilter;
  const activeTagFilter = filters.has(MAP_FILTER.TAG)
    ? tagFilter
    : TAG_FILTER.ALL;
  const setFictionFilter =
    sharedFilters?.setFictionFilter ?? setLocalFictionFilter;
  const monitoringFilter =
    sharedFilters?.monitoringFilter ?? localMonitoringFilter;
  const setMonitoringFilter =
    sharedFilters?.setMonitoringFilter ?? setLocalMonitoringFilter;
  const sharedSearch = sharedFilters?.search ?? "";
  const hasSharedLocationFilter =
    typeof sharedFilters?.setLocationFilter === "function";
  const locationFilter = hasSharedLocationFilter
    ? (sharedFilters.locationFilter ?? null)
    : localLocationFilter;
  const setLocationFilter = hasSharedLocationFilter
    ? sharedFilters.setLocationFilter
    : setLocalLocationFilter;
  const hasSharedMainLocationFilter =
    typeof sharedFilters?.setMainLocationFilter === "function";
  const mainLocationFilter = hasSharedMainLocationFilter
    ? (sharedFilters.mainLocationFilter ?? null)
    : localMainLocationFilter;
  const setMainLocationFilter = hasSharedMainLocationFilter
    ? sharedFilters.setMainLocationFilter
    : setLocalMainLocationFilter;
  const lastLocationFilter = sharedFilters?.lastLocationFilter ?? null;
  const {
    enabledLocations,
    enabledMainLocations,
    mainLocations,
    toggleLocation,
    toggleMainLocation,
  } = useLocationToggles({
    locationFilter,
    locationKey,
    locations,
    mainLocationFilter,
    mainLocationKey,
    normalizedLeaks,
    setLocationFilter,
    setMainLocationFilter,
    sharedSearch,
  });

  // Всё, кроме тега: от этой выборки считаются и сам отбор, и счётчики его
  // кнопок — иначе при «тега нет» вторая кнопка показывала бы ноль.
  const beforeTagLeaks = useMemo(
    () =>
      normalizedLeaks.filter(
        (leak) =>
          enabledLocations[leak._location] &&
          enabledMainLocations[
            normalizeLocationValue(leak?.[mainLocationKey])
          ] &&
          // The map has no toggle list for the third level; it only honours
          // what the location browser set, so an unfiltered level passes
          // everything through.
          matchesLeakLocationFilter(leak, lastLocationFilter) &&
          (statusFilters.length === 0 ||
            statusFilters.includes(leak.status ?? STATUS.OPEN)) &&
          (priorityFilters.length === 0 ||
            priorityFilters.includes(leak.priority ?? null)) &&
          // Фикция — по ленте осмотров; разбирается, только когда отбор
          // включён.
          (fictionFilter === FICTION_FILTER.ALL ||
            isLeakFiction(leak) === (fictionFilter === FICTION_FILTER.ONLY)),
      ),
    [
      normalizedLeaks,
      enabledLocations,
      enabledMainLocations,
      lastLocationFilter,
      mainLocationKey,
      statusFilters,
      priorityFilters,
      fictionFilter,
    ],
  );

  // Ответ «Физ. тег есть?» разбирается по ленте осмотров — только на карте,
  // где отбор по тегу есть.
  const tagAnswers = useMemo(
    () =>
      filters.has(MAP_FILTER.TAG)
        ? new Map(
            beforeTagLeaks.map((leak) => [
              leak,
              getLastMonitoringFlag(leak, "physicalTag"),
            ]),
          )
        : null,
    [beforeTagLeaks, filters],
  );

  const tagCounts = useMemo(() => {
    const counts = { with: 0, without: 0 };
    for (const answer of tagAnswers?.values() ?? []) {
      if (answer === true) counts.with += 1;
      else if (answer === false) counts.without += 1;
    }
    return counts;
  }, [tagAnswers]);

  const filteredLeaks = useMemo(() => {
    if (activeTagFilter === TAG_FILTER.ALL || !tagAnswers)
      return beforeTagLeaks;
    const want = activeTagFilter === TAG_FILTER.WITH;
    return beforeTagLeaks.filter((leak) => tagAnswers.get(leak) === want);
  }, [beforeTagLeaks, tagAnswers, activeTagFilter]);

  const togglePriorityFilter = useCallback(
    (priority) => {
      setPriorityFilter((current) => {
        const values = normalizeMultiFilter(current);
        return values.includes(priority)
          ? values.filter((item) => item !== priority)
          : [...values, priority];
      });
    },
    [setPriorityFilter],
  );

  const toggleStatusFilter = useCallback(
    (status) => {
      setStatusFilter((current) => {
        const values = normalizeMultiFilter(current);
        return values.includes(status)
          ? values.filter((item) => item !== status)
          : [...values, status];
      });
    },
    [setStatusFilter],
  );

  const monitoringLeaks = useMemo(
    () =>
      filterLeaksByMonitoring(
        filteredLeaks,
        hasMonitoringRound ? monitoringFilter : MONITORING_FILTER.ALL,
        monitoringRoundId,
        monitoringRoundNumber,
      ),
    [
      filteredLeaks,
      hasMonitoringRound,
      monitoringFilter,
      monitoringRoundId,
      monitoringRoundNumber,
    ],
  );

  const hasGps =
    gpsEnabled && Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng);

  const visibleLeaks = useMemo(() => {
    if (nearbyOnly && hasGps) {
      return monitoringLeaks
        .map((leak) => ({
          ...leak,
          _distance: getDistanceMeters(
            coords.lat,
            coords.lng,
            leak.lat,
            leak.lng,
          ),
        }))
        .filter((leak) => leak._distance <= nearbyRadius)
        .sort((left, right) => left._distance - right._distance);
    }

    // Marker order is irrelevant. Sort by distance only while the user is
    // viewing the bottom sheet; this avoids cloning 10,000 records on every pan.
    if (!open || !mapCenter) return monitoringLeaks;

    const roundedLat = Math.round(mapCenter.lat * 1000) / 1000;
    const roundedLng = Math.round(mapCenter.lng * 1000) / 1000;
    const cache = distanceCacheRef.current;
    return monitoringLeaks
      .map((leak) => {
        const key = `${leak.id}_${roundedLat}_${roundedLng}`;
        let distance = cache.get(key);
        if (distance === undefined) {
          distance = getDistanceMeters(
            mapCenter.lat,
            mapCenter.lng,
            leak.lat,
            leak.lng,
          );
          if (cache.size > 20_000) cache.delete(cache.keys().next().value);
          cache.set(key, distance);
        }
        return { ...leak, _distance: distance };
      })
      .sort((left, right) => left._distance - right._distance);
  }, [
    monitoringLeaks,
    open,
    mapCenter,
    nearbyOnly,
    nearbyRadius,
    coords,
    hasGps,
  ]);
  /**
   * Покрытие обхода прямо на булавке.
   *
   * Отбор «осмотрено / не осмотрено» на карте был и раньше, но показывал
   * только одну половину за раз, а вопрос стоит про обе сразу: где ещё не
   * были. Признак едет с точкой, и карта отвечает на него не переключателем,
   * а видом.
   *
   * Ставится только при заведённом обходе: без него «не осмотрено» значило бы
   * «никогда не проверялось», а это другой вопрос и другой ответ.
   */
  const markerLeaks = useMemo(() => {
    const source = nearbyOnly ? visibleLeaks : monitoringLeaks;
    if (!hasMonitoringRound) return source;
    return source.map((leak) => ({
      ...leak,
      _checkedInRound: !isMonitoringDue(
        leak,
        monitoringRoundId,
        monitoringRoundNumber,
      ),
    }));
  }, [
    hasMonitoringRound,
    monitoringLeaks,
    monitoringRoundId,
    monitoringRoundNumber,
    nearbyOnly,
    visibleLeaks,
  ]);

  return {
    visibleLeaks,
    markerLeaks,
    monitoringFilter,
    hasMonitoringRound,
    mainLocations,
    mainLocationLabel,
    enabledMainLocations,
    locations,
    locationLabel,
    enabledLocations,
    nearbyOnly,
    nearbyRadius,
    nearbyRadiusOptions: NEARBY_RADIUS_OPTIONS,
    priorityFilters,
    statusFilters,
    fictionFilter,
    setFictionFilter,
    tagFilter: activeTagFilter,
    setTagFilter,
    tagCounts,
    hasGps,
    setMonitoringFilter,
    setNearbyOnly,
    setNearbyRadius,
    togglePriorityFilter,
    clearPriorityFilters: () => setPriorityFilter([]),
    toggleStatusFilter,
    clearStatusFilters: () => setStatusFilter([]),
    toggleMainLocation,
    toggleLocation,
  };
}
