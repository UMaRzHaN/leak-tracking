/**
 * Converts legacy project variables to the units used by current formulas:
 * density in kg/m³ and uncertainty in percent.
 */
export function normalizeProjectVarsUnits(vars) {
  if (!vars || typeof vars !== "object" || Array.isArray(vars)) return vars;

  const density = Number(vars.density);
  const uncertainty = Number(vars.uncertainty);
  const legacyDensity =
    Number.isFinite(density) && density > 0 && density < 0.01;
  const legacyUncertainty =
    Number.isFinite(uncertainty) && uncertainty > 0 && uncertainty <= 1;

  if (!legacyDensity && !legacyUncertainty) return vars;

  return {
    ...vars,
    ...(legacyDensity
      ? { density: GAS_TYPES[vars.gasType]?.density ?? density * 1000 }
      : {}),
    ...(legacyUncertainty ? { uncertainty: uncertainty * 100 } : {}),
  };
}
import { GAS_TYPES } from "@/data/variables";
