import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { getDistanceMeters } from "@/utils/geoUtils";
import { STATUS } from "@/utils/status";
import { readMonitoringRound } from "@/utils/monitoringRound";
import {
  buildLocationFilterFromEnabled,
  buildSmartLocationSelection,
  getEnabledLocations,
  matchesLeakLocationFilter,
  normalizeLocationValue,
} from "@/utils/locationFilter";
import {
  MONITORING_FILTER,
  filterLeaksByMonitoring,
} from "@/pages/Monitoring/monitoringDomain";
import {
  NEARBY_RADIUS_M,
  normalizeMultiFilter,
} from "@/pages/DataBase/hooks/useDataBaseFilters";

const NEARBY_RADIUS_OPTIONS = [100, 500, 1000];

export function useMapFilters({
  leaks,
  coords,
  gpsEnabled,
  sharedFilters,
  activeProjectId,
  open,
  mapCenter,
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
  const [localPriorityFilter, setLocalPriorityFilter] = useState([]);
  const [localStatusFilter, setLocalStatusFilter] = useState([]);
  const [localMainLocationFilter, setLocalMainLocationFilter] = useState(null);
  const [localLocationFilter, setLocalLocationFilter] = useState(null);
  const [localMonitoringFilter, setLocalMonitoringFilter] = useState(
    MONITORING_FILTER.DUE,
  );
  const monitoringRound = useMemo(
    () => readMonitoringRound(activeProjectId),
    [activeProjectId],
  );
  const monitoringRoundId = monitoringRound?.id ?? null;
  const monitoringRoundNumber = monitoringRound?.number ?? null;
  const hasMonitoringRound = Boolean(monitoringRoundId);

  const nearbyOnly = sharedFilters?.nearbyFilter ?? localNearbyOnly;
  const setNearbyOnly = sharedFilters?.setNearbyFilter ?? setLocalNearbyOnly;
  const nearbyRadius = sharedFilters?.nearbyRadius ?? localNearbyRadius;
  const setNearbyRadius =
    sharedFilters?.setNearbyRadius ?? setLocalNearbyRadius;
  const priorityFilters = normalizeMultiFilter(
    sharedFilters?.priorityFilter ?? localPriorityFilter,
  );
  const setPriorityFilter =
    sharedFilters?.setPriorityFilter ?? setLocalPriorityFilter;
  const statusFilters = normalizeMultiFilter(
    sharedFilters?.statusFilter ?? localStatusFilter,
  );
  const setStatusFilter = sharedFilters?.setFilter ?? setLocalStatusFilter;
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

  const filteredLeaks = useMemo(
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
            priorityFilters.includes(leak.priority ?? null)),
      ),
    [
      normalizedLeaks,
      enabledLocations,
      enabledMainLocations,
      lastLocationFilter,
      mainLocationKey,
      statusFilters,
      priorityFilters,
    ],
  );

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
  const markerLeaks = nearbyOnly ? visibleLeaks : monitoringLeaks;

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
