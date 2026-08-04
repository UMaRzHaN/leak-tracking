export const PRIORITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export const PRIORITY_ORDER = ["critical", "high", "medium", "low"];

export const PRIORITY_META = {
  critical: {
    color: "var(--c-critical)",
    bg: "var(--c-critical-bg)",
    border: "var(--c-critical-border)",
  },
  high: {
    color: "var(--c-high)",
    bg: "var(--c-high-bg)",
    border: "var(--c-high-border)",
  },
  medium: {
    color: "var(--c-medium)",
    bg: "var(--c-medium-bg)",
    border: "var(--c-medium-border)",
  },
  low: {
    color: "var(--c-low)",
    bg: "var(--c-low-bg)",
    border: "var(--c-low-border)",
  },
};

// `label`/`short` come from the `priority` locale namespace; PRIORITY_META
// carries only the colours, which are the same in every language.
export function getPriorityMeta(priority, t) {
  const meta = PRIORITY_META[priority];
  if (!meta) return null;

  return {
    ...meta,
    label: t(`priority.${priority}.label`),
    short: t(`priority.${priority}.short`),
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
