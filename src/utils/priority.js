export const PRIORITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export const PRIORITY_ORDER = ["critical", "high", "medium", "low"];

export const PRIORITY_META = {
  critical: {
    label: "Критичный",
    short: "Крит",
    color: "var(--c-critical)",
    bg: "var(--c-critical-bg)",
    border: "var(--c-critical-border)",
  },
  high: {
    label: "Высокий",
    short: "Выс",
    color: "var(--c-high)",
    bg: "var(--c-high-bg)",
    border: "var(--c-high-border)",
  },
  medium: {
    label: "Средний",
    short: "Сред",
    color: "var(--c-medium)",
    bg: "var(--c-medium-bg)",
    border: "var(--c-medium-border)",
  },
  low: {
    label: "Низкий",
    short: "Низ",
    color: "var(--c-low)",
    bg: "var(--c-low-bg)",
    border: "var(--c-low-border)",
  },
};

export function getPriorityMeta(priority, t, lang = "ru") {
  const meta = PRIORITY_META[priority];
  if (!meta) return null;

  const defaults =
    lang === "ru"
      ? {
          critical: { label: "Критичный", short: "Крит" },
          high: { label: "Высокий", short: "Выс" },
          medium: { label: "Средний", short: "Сред" },
          low: { label: "Низкий", short: "Низ" },
        }
      : {
          critical: { label: "Critical", short: "Crit" },
          high: { label: "High", short: "High" },
          medium: { label: "Medium", short: "Med" },
          low: { label: "Low", short: "Low" },
        };

  return {
    ...meta,
    label:
      t?.(`priority.${priority}.label`, {
        defaultValue: defaults[priority]?.label ?? meta.label,
      }) ??
      defaults[priority]?.label ??
      meta.label,
    short:
      t?.(`priority.${priority}.short`, {
        defaultValue: defaults[priority]?.short ?? meta.short,
      }) ??
      defaults[priority]?.short ??
      meta.short,
  };
}

const SPEED_THRESHOLDS = [
  { min: 100, priority: PRIORITY.CRITICAL },
  { min: 50, priority: PRIORITY.HIGH },
  { min: 10, priority: PRIORITY.MEDIUM },
  { min: 0, priority: PRIORITY.LOW },
];

export function priorityFromSpeed(speed) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return SPEED_THRESHOLDS.find((item) => value >= item.min)?.priority ?? null;
}
