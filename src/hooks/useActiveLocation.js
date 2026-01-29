// src/hooks/useActiveLocation.js
import { useMemo } from "react";
import { useProject } from "../app/settings/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "../configs/projectLocation.config";

const NO_LABEL = "Не указано";

export function useActiveLocation(leaks) {
  const { project } = useProject();
  const config = PROJECT_LOCATION_CONFIG[project];

  const secondary = config.secondary;

  const normalizedLeaks = useMemo(() => {
    return leaks.map((l) => ({
      ...l,
      _location: l[secondary] || NO_LABEL,
    }));
  }, [leaks, secondary]);

  const locations = useMemo(() => {
    return Array.from(new Set(normalizedLeaks.map((l) => l._location)));
  }, [normalizedLeaks]);

  return {
    secondary, // station | deposit | district
    label: config.label, // для UI
    leaks: normalizedLeaks,
    locations,
  };
}
