import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { normalizeLocationValue } from "@/utils/locationFilter";

function getLocationTexts(project, lang) {
  const isRu = lang === "ru";

  switch (project) {
    case "upstream":
      return {
        label: isRu ? "Месторождение" : "Deposit",
        mainLabel: isRu ? "Подразделение" : "Subdivision",
      };
    case "midstream":
      return {
        label: isRu ? "Станция" : "Station",
        mainLabel: isRu ? "УМГ" : "MGPA",
      };
    case "downstream":
      return {
        label: isRu ? "Населённый пункт" : "Locality",
        mainLabel: isRu ? "Район" : "District",
      };
    default:
      return {
        label: isRu ? "Локация" : "Location",
        mainLabel: isRu ? "Основное поле" : "Primary field",
      };
  }
}

export function useActiveLocation(leaks) {
  const { lang } = useLanguage();
  const { project } = useProjectData();
  const config = PROJECT_LOCATION_CONFIG[project];

  const texts = getLocationTexts(project, lang);
  const main = config.main;
  const secondary = config.secondary;

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
    label: texts.label,
    mainLabel: texts.mainLabel,
    leaks: normalizedLeaks,
    locations,
  };
}
