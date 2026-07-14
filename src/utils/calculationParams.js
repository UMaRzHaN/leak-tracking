import { calculations } from "@/utils/calculations/calculations";

export const CALCULATION_PARAMS_VERSION = 1;

export const CALCULATION_PARAM_KEYS = Object.freeze([
  "equipmentType",
  "serial_number",
  "uncertainty",
  "gasType",
  "density",
  "gasPercentage",
  "percentage_gas_to_flare",
  "percentage_gas_to_utilization",
  "GWP",
  "GWP_Minus",
  "Operating_mode",
]);

function pickDefined(source, target) {
  if (!source || typeof source !== "object") return;

  CALCULATION_PARAM_KEYS.forEach((key) => {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  });
}

/**
 * Project variables are defaults. Legacy top-level fields and the explicit
 * per-leak snapshot override them, preserving old records during migration.
 */
export function buildLeakCalculationParams(leak = {}, projectVars = {}) {
  const params = {};
  pickDefined(projectVars, params);
  pickDefined(leak, params);
  pickDefined(leak.calculationParams, params);

  if (params.percentage_gas_to_flare != null) {
    params.percentage_gas_to_utilization =
      100 - Number(params.percentage_gas_to_flare);
  }

  return params;
}

export function calculationParamsEqual(left = {}, right = {}) {
  return CALCULATION_PARAM_KEYS.every((key) => left[key] === right[key]);
}

export function calculateLeakWithSnapshot(
  leak,
  projectVars,
  calculationParams,
) {
  const source =
    calculationParams === undefined ? leak : { ...leak, calculationParams };
  const params = buildLeakCalculationParams(source, projectVars);

  return calculations(
    {
      ...leak,
      calculationParams: params,
      calculationVersion: CALCULATION_PARAMS_VERSION,
    },
    params,
  );
}
