import { useMemo } from "react";
import { useProjectConfig } from "./useProjectConfig";
import { useProjectData } from "@/app/project/ProjectContext";
import { useHiddenFields } from "./useHiddenFields";
import {
  hideFieldsInExcel,
  hideFieldsInSteps,
  withoutProtected,
} from "@/configs/shared/hideFields";

/**
 * Returns the project config with hidden fields filtered out from:
 *   - steps[].fields  (LeakForm)
 *   - export.excel.headers / keysOrder  (Excel export)
 *
 * system.numeric, system.copyable etc. are intentionally NOT filtered
 * because they're used for data processing, not display.
 */
export function useEffectiveProjectConfig() {
  const config = useProjectConfig();
  const { activeProject } = useProjectData();
  const { hiddenFields } = useHiddenFields(activeProject?.id ?? null);

  return useMemo(() => {
    if (!hiddenFields.size) return config;
    const hidden = withoutProtected(hiddenFields);
    if (!hidden.size) return config;

    return {
      ...config,
      steps: {
        ...config.steps,
        steps: hideFieldsInSteps(config.steps.steps, hidden),
      },
      export: {
        ...config.export,
        excel: hideFieldsInExcel(config.export.excel, hidden),
      },
    };
  }, [config, hiddenFields]);
}
