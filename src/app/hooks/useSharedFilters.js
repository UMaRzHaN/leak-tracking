import { useEffect, useMemo, useRef, useState } from "react";
import { MONITORING_FILTER, NEARBY_RADIUS_M } from "@/domain/leakFilters";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import {
  readProjectFilters,
  writeProjectFilters,
} from "@/app/project/projectFilters";

// The filters are held above the pages because the database, the map, the
// monitoring list and the location browser all read the same selection: moving
// between them must not reset where the user is. They are persisted per
// project, so the selection also survives a reload and a project switch.

export function useSharedFilters({ projectId, projectType }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  const [priorityFilter, setPriorityFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  /*
   * Состояние железа — отдельно от статуса утечки: словари разные, а живёт
   * фильтр здесь по той же причине, что и остальные. Реестр и карта на базе
   * железа показывают один и тот же отбор, и переход между ними не должен его
   * сбрасывать.
   */
  const [componentStatusFilter, setComponentStatusFilter] = useState(
    /** @type {string[]} */ ([]),
  );
  const [mainLocationFilter, setMainLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [locationFilter, setLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [lastLocationFilter, setLastLocationFilter] = useState(
    /** @type {string|null} */ (null),
  );
  const [nearbyFilter, setNearbyFilter] = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState(NEARBY_RADIUS_M);
  const [monitoringFilter, setMonitoringFilter] = useState(
    MONITORING_FILTER.DUE,
  );

  const persistenceProjectRef = useRef(null);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    persistenceProjectRef.current = projectId ?? null;
    skipNextPersistRef.current = true;
    const stored = readProjectFilters(projectId ?? null);
    // Из общего конфига места, а не из конфига типа проекта: нужны три
    // имени полей, а `PROJECTS` тянет за собой словари полей и шаги формы —
    // тридцать килобайт на первый экран ради трёх строк.
    const locationConfig = PROJECT_LOCATION_CONFIG[projectType];

    // A location filter names a field of the project type it was saved under.
    // Carrying it into a different type would filter on a field the records do
    // not have, hiding everything.
    const keep = (filter, key) => (filter?.key === key ? filter : null);

    setSearch(stored.search);
    setStatusFilter(stored.statusFilter);
    setPriorityFilter(stored.priorityFilter);
    setComponentStatusFilter(stored.componentStatusFilter);
    setMainLocationFilter(
      keep(stored.mainLocationFilter, locationConfig?.main),
    );
    setLocationFilter(keep(stored.locationFilter, locationConfig?.secondary));
    setLastLocationFilter(
      keep(stored.lastLocationFilter, locationConfig?.last),
    );
    setNearbyFilter(stored.nearbyFilter);
    setNearbyRadius(stored.nearbyRadius);
    setMonitoringFilter(stored.monitoringFilter);
  }, [projectId, projectType]);

  useEffect(() => {
    if (!projectId || persistenceProjectRef.current !== projectId) return;
    // The load above sets nine pieces of state; without this the first render
    // after it would write the freshly loaded values straight back.
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    writeProjectFilters(projectId, {
      search,
      statusFilter,
      priorityFilter,
      componentStatusFilter,
      mainLocationFilter,
      locationFilter,
      lastLocationFilter,
      nearbyFilter,
      nearbyRadius,
      monitoringFilter,
    });
  }, [
    projectId,
    projectType,
    search,
    statusFilter,
    priorityFilter,
    componentStatusFilter,
    mainLocationFilter,
    locationFilter,
    lastLocationFilter,
    nearbyFilter,
    nearbyRadius,
    monitoringFilter,
  ]);

  return useMemo(
    () => ({
      search,
      setSearch,
      statusFilter,
      setFilter: setStatusFilter,
      priorityFilter,
      setPriorityFilter,
      componentStatusFilter,
      setComponentStatusFilter,
      mainLocationFilter,
      setMainLocationFilter,
      locationFilter,
      setLocationFilter,
      lastLocationFilter,
      setLastLocationFilter,
      nearbyFilter,
      setNearbyFilter,
      nearbyRadius,
      setNearbyRadius,
      monitoringFilter,
      setMonitoringFilter,
    }),
    [
      search,
      statusFilter,
      priorityFilter,
      componentStatusFilter,
      mainLocationFilter,
      locationFilter,
      lastLocationFilter,
      nearbyFilter,
      nearbyRadius,
      monitoringFilter,
    ],
  );
}
