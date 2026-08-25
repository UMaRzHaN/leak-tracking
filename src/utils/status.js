export const STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
};

export const STATUS_META = {
  open: {
    color: "var(--c-open-text)",
    bg: "var(--c-open-bg)",
    border: "var(--c-open-border)",
  },
  in_progress: {
    color: "var(--c-progress-text)",
    bg: "var(--c-progress-bg)",
    border: "var(--c-progress-border)",
  },
  resolved: {
    color: "var(--c-resolved-text)",
    bg: "var(--c-resolved-bg)",
    border: "var(--c-resolved-border)",
  },
};

export const STATUS_ORDER = [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.RESOLVED];

export function getStatusLabel(status, t) {
  const normalized = status ?? STATUS.OPEN;
  return t(`leakDetails.statuses.${normalized}`, { defaultValue: normalized });
}

/**
 * Production-level transition map.
 * open -> in_progress -> resolved -> open (re-open).
 * No skipping: open cannot jump to resolved directly.
 */
export const STATUS_TRANSITIONS = {
  [STATUS.OPEN]: { next: STATUS.IN_PROGRESS },
  [STATUS.IN_PROGRESS]: { next: STATUS.RESOLVED },
  [STATUS.RESOLVED]: { next: STATUS.OPEN },
};

/** Next status following the strict production workflow */
export function nextStatus(current) {
  return STATUS_TRANSITIONS[current ?? STATUS.OPEN]?.next ?? STATUS.IN_PROGRESS;
}

/** Label for the transition action button */
export function transitionLabel(current, t) {
  const normalized = current ?? STATUS.OPEN;
  return t(`statusActions.${normalized}`, {
    defaultValue: t("statusActions.fallback"),
  });
}

export function getStatusMeta(status, t) {
  const normalized = status ?? STATUS.OPEN;
  const meta = STATUS_META[normalized] ?? STATUS_META.open;

  return {
    ...meta,
    label: getStatusLabel(normalized, t),
    short: getStatusLabel(normalized, t),
  };
}
