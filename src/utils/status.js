export const STATUS = {
  OPEN:       "open",
  IN_PROGRESS:"in_progress",
  RESOLVED:   "resolved",
};

export const STATUS_META = {
  open:        { label: "Открыта",    short: "Открыта",   color: "var(--c-open)",     bg: "var(--c-open-bg)",     border: "var(--c-open-border)" },
  in_progress: { label: "В работе",   short: "В работе",  color: "var(--c-progress)", bg: "var(--c-progress-bg)", border: "var(--c-progress-border)" },
  resolved:    { label: "Устранена",  short: "Готово",    color: "var(--c-resolved)", bg: "var(--c-resolved-bg)", border: "var(--c-resolved-border)" },
};

export const STATUS_ORDER = [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.RESOLVED];

/**
 * Production-level transition map.
 * open → in_progress → resolved → open (re-open).
 * No skipping: open cannot jump to resolved directly.
 */
export const STATUS_TRANSITIONS = {
  [STATUS.OPEN]:        { next: STATUS.IN_PROGRESS, action: "Взять в работу" },
  [STATUS.IN_PROGRESS]: { next: STATUS.RESOLVED,    action: "Устранено" },
  [STATUS.RESOLVED]:    { next: STATUS.OPEN,        action: "Переоткрыть" },
};

/** Next status following the strict production workflow */
export function nextStatus(current) {
  return STATUS_TRANSITIONS[current ?? STATUS.OPEN]?.next ?? STATUS.IN_PROGRESS;
}

/** Label for the transition action button */
export function transitionLabel(current) {
  return STATUS_TRANSITIONS[current ?? STATUS.OPEN]?.action ?? "Изменить статус";
}

export function getStatusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.open;
}
