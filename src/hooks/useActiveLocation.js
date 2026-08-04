import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { normalizeLocationValue } from "@/utils/locationFilter";

export function useActiveLocation(leaks) {
  const { t } = useLanguage();
  const { project } = useProjectData();
  const config = PROJECT_LOCATION_CONFIG[project];

  const main = config.main;
  const secondary = config.secondary;
  // The two location fields a project uses are named by its type, and those
  // names are already keys under `database.locationLabels` — no branching on
  // language needed, only a lookup.
  const label = t(`database.locationLabels.${secondary}`);
  const mainLabel = t(`database.locationLabels.${main}`);

  const normalizedLeaks = useMemo(() => {
    return leaks.map((leak) => ({
      ...leak,
      _location: normalizeLocationValue(leak[secondary]),
    }));
  }, [leaks, secondary]);

  const locations = useMemo(() => {
    return Array.from(new Set(normalizedLeaks.map((leak) => leak._location)));
  }, [normalizedLeaks]);

  return {
    main,
    secondary,
    label,
    mainLabel,
    leaks: normalizedLeaks,
    locations,
  };
}
