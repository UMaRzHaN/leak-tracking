import { useMemo } from "react";
import { useProjectConfig } from "./useProjectConfig";
import { useProject } from "./ProjectContext";
import { useHiddenFields } from "./useHiddenFields";

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
  const { activeProject } = useProject();
  const { hiddenFields } = useHiddenFields(activeProject?.id ?? null);

  return useMemo(() => {
    if (!hiddenFields.size) return config;

    const filteredSteps = config.steps.steps
      .map((step) => ({
        ...step,
        fields: step.fields.filter((f) => !hiddenFields.has(f.key)),
      }))
      .filter((step) => step.fields.length > 0);

    const { headers, keysOrder } = config.export.excel;
    const filteredPairs = keysOrder
      .map((key, i) => ({ key, header: headers[i] }))
      .filter(({ key }) => !hiddenFields.has(key));

    return {
      ...config,
      steps: { ...config.steps, steps: filteredSteps },
      export: {
        ...config.export,
        excel: {
          ...config.export.excel,
          headers: filteredPairs.map((p) => p.header),
          keysOrder: filteredPairs.map((p) => p.key),
        },
      },
    };
  }, [config, hiddenFields]);
}
