import { useEffect, useMemo, useRef, useState } from "react";
import { NEARBY_RADIUS_M } from "@/pages/DataBase/hooks/useDataBaseFilters";
import { MONITORING_FILTER } from "@/pages/Monitoring/monitoringDomain";
import { PROJECTS } from "@/configs/projects";
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
  const [statusFilter, setStatusFilter] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState([]);
  const [mainLocationFilter, setMainLocationFilter] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);
  const [lastLocationFilter, setLastLocationFilter] = useState(null);
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
    const locationConfig = PROJECTS[projectType]?.system?.location;

    // A location filter names a field of the project type it was saved under.
    // Carrying it into a different type would filter on a field the records do
    // not have, hiding everything.
    const keep = (filter, key) => (filter?.key === key ? filter : null);

    setSearch(stored.search);
    setStatusFilter(stored.statusFilter);
    setPriorityFilter(stored.priorityFilter);
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
      mainLocationFilter,
      locationFilter,
      lastLocationFilter,
      nearbyFilter,
      nearbyRadius,
      monitoringFilter,
    ],
  );
}
