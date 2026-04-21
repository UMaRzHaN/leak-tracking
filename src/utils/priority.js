export const PRIORITY = {
  CRITICAL: "critical",
  HIGH:     "high",
  MEDIUM:   "medium",
  LOW:      "low",
};

export const PRIORITY_ORDER = ["critical", "high", "medium", "low"];

export const PRIORITY_META = {
  critical: { label: "Критичный", short: "Крит", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  high:     { label: "Высокий",   short: "Выс",  color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  medium:   { label: "Средний",   short: "Сред", color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" },
  low:      { label: "Низкий",    short: "Низ",  color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
};

// Thresholds in л/мин
const SPEED_THRESHOLDS = [
  { min: 100, priority: PRIORITY.CRITICAL },
  { min: 50,  priority: PRIORITY.HIGH },
  { min: 10,  priority: PRIORITY.MEDIUM },
  { min: 0,  priority: PRIORITY.LOW },
];

export function priorityFromSpeed(speed) {
  const v = Number(speed);
  if (!Number.isFinite(v) || v <= 0) return null;
  return SPEED_THRESHOLDS.find((t) => v >= t.min)?.priority ?? null;
}
