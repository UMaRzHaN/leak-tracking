import { STATUS } from "@/utils/status";
import {
  buildLeakCalculationParams,
  calculateLeakWithSnapshot,
} from "@/utils/calculationParams";
import { priorityFromSpeed } from "@/utils/priority";
import { normalizeNumber } from "@/utils/normalize/normalizeNumber";
import { buildLeakHistoryChanges } from "@/utils/historyChanges";

export const REOPEN_CALC_FIELDS = [
  { key: "equipmentType", ru: "Тип оборудования", en: "Equipment type" },
  {
    key: "serial_number",
    ru: "Серийный номер оборудования",
    en: "Equipment serial number",
  },
  { key: "Operating_mode", ru: "Режим работы", en: "Operating mode" },
  { key: "gasType", ru: "Тип газа", en: "Gas type" },
  { key: "percentage_gas_to_flare", ru: "Газ на сжигание", en: "Gas to flare" },
  { key: "gasPercentage", ru: "Содержание газа в смеси", en: "Gas content" },
  { key: "GWP", ru: "GWP", en: "GWP" },
  { key: "GWP_Minus", ru: "GWP_Minus", en: "GWP_Minus" },
];

export const REOPEN_MEASUREMENT_FIELDS = [
  {
    key: "leak_speed",
    ru: "Скорость утечки, л/мин",
    en: "Leak speed, L/min",
  },
  {
    key: "pressure",
    ru: "Давление",
    en: "Pressure",
  },
  {
    key: "temperature",
    ru: "Температура, °C",
    en: "Temperature, °C",
  },
];

export function normalizeReopenMeasurements(draft = {}) {
  return Object.fromEntries(
    REOPEN_MEASUREMENT_FIELDS.map(({ key }) => {
      const normalized = normalizeNumber(draft[key]);
      return [key, normalized === "" ? undefined : normalized];
    }).filter(([, value]) => value !== undefined),
  );
}

function normalizeCalcVar(key, value) {
  if (key === "equipmentType" || key === "gasType") return value;
  const normalized = normalizeNumber(value);
  return normalized === "" ? null : normalized;
}

export function buildReopenCalcVars({ leak, vars, draft = {} }) {
  const initial = buildLeakCalculationParams(leak, vars);

  const patch = draft.calcVars ?? {};
  const next = { ...initial };
  Object.entries(patch).forEach(([key, value]) => {
    next[key] = normalizeCalcVar(key, value);
  });

  if (next.percentage_gas_to_flare != null) {
    next.percentage_gas_to_utilization = 100 - next.percentage_gas_to_flare;
  }

  return next;
}

export function buildReopenedLeak({
  leak,
  draft,
  vars,
  now = Date.now(),
  user,
}) {
  const measurements = normalizeReopenMeasurements(draft);
  const calcVars = buildReopenCalcVars({ leak, vars, draft });
  const base = {
    ...leak,
    ...measurements,
    ...(leak.status === STATUS.RESOLVED
      ? { photo: leak.photo_after ?? leak.photo, photo_after: null }
      : {}),
    status: STATUS.OPEN,
    resolvedAt: null,
    updatedAt: now,
  };
  const recalculated = calculateLeakWithSnapshot(base, vars, calcVars);
  const after = {
    ...recalculated,
    priority: priorityFromSpeed(recalculated.leak_speed),
  };
  const changes = buildLeakHistoryChanges({
    before: leak,
    after,
    fields: REOPEN_MEASUREMENT_FIELDS,
    includeKeys: ["priority"],
  });
  const calcChanges = buildLeakHistoryChanges({
    before: buildReopenCalcVars({ leak, vars }),
    after: calcVars,
    fields: REOPEN_CALC_FIELDS,
  });

  return {
    ...after,
    history: [
      ...(leak.history ?? []),
      {
        action: "status_changed",
        to: STATUS.OPEN,
        date: new Date(now).toISOString(),
        user,
        ...(changes.length + calcChanges.length > 0
          ? { changes: [...changes, ...calcChanges] }
          : {}),
      },
    ],
  };
}
