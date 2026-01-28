import { useCallback } from "react";
import { STORAGE_KEYS } from "./storageKeys";
import * as variables from "../../data/variables";
const defaultVars = {
  equipmentType: variables.equipmentType,
  uncertainty: variables.uncertainty,
  gasType: variables.gasType,
  density: variables.density,

  percentage_gas_to_flare: variables.percentage_gas_to_flare,
  percentage_gas_to_utilization: 100 - variables.percentage_gas_to_flare,
  GWP: variables.GWP,
  serial_number: variables.serial_number,
};

export function useProjectVars(projectId, defaults = defaultVars) {
  if (!projectId) {
    throw new Error("useProjectVars: projectId is required");
  }

  const storageKey = STORAGE_KEYS.PROJECT_SETTINGS(projectId);

  const vars = (() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  })();

  const setVars = useCallback(
    (nextVars) => {
      localStorage.setItem(storageKey, JSON.stringify(nextVars));
    },
    [storageKey],
  );

  const resetVars = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { vars, setVars, resetVars };
}
