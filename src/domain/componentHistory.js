import { buildLeakHistoryChanges } from "@/utils/historyChanges";
import { requireHistoryUser } from "@/utils/historyUser";

/**
 * The trail a component card leaves behind.
 *
 * Same shape as a leak's history — action, date, user, changes — because the
 * two are read side by side and a second format would only have to be learned
 * twice. What differs is what gets recorded: a component has no repair to
 * follow, so the entries are its creation, edits to its passport, and the
 * inspections that revisit it.
 *
 * Every entry demands a user name. Not politeness: a registry that nobody signs
 * is a list of assertions with no one behind them, and the first disagreement
 * about a reading has nowhere to go. `requireHistoryUser` throws rather than
 * writing "unknown", which is what makes the name a precondition for filling a
 * card at all rather than a field somebody skips.
 */

export const COMPONENT_HISTORY_ACTIONS = Object.freeze({
  CREATED: "component_created",
  EDITED: "component_edited",
  INSPECTED: "component_inspected",
});

function entry({ action, user, now, ...rest }) {
  const timestamp = typeof now === "number" ? now : Date.now();
  return {
    action,
    date: new Date(timestamp).toISOString(),
    user: requireHistoryUser(user),
    ...rest,
  };
}

function withEntry(component, historyEntry) {
  return {
    ...component,
    history: [...(component?.history ?? []), historyEntry],
  };
}

/**
 * @param {Record<string, any>} component
 * @param {{user?: string, now?: number}} options
 */
export function recordComponentCreated(component, { user, now } = {}) {
  return withEntry(
    component,
    entry({ action: COMPONENT_HISTORY_ACTIONS.CREATED, user, now }),
  );
}

/**
 * Records an edit, and only when something actually changed.
 *
 * An entry per save regardless would bury the one edit that matters under a
 * hundred that changed nothing — somebody opening a card to read it and
 * pressing save on the way out.
 *
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @param {{user?: string, now?: number, fields?: {key: string}[]}} options
 */
export function recordComponentEdited(
  before,
  after,
  { user, now, fields = [] } = {},
) {
  const changes = buildLeakHistoryChanges({ before, after, fields });
  if (changes.length === 0) return after;

  return withEntry(
    after,
    entry({ action: COMPONENT_HISTORY_ACTIONS.EDITED, user, now, changes }),
  );
}

/**
 * Records an inspection: the state of the hardware as found, and the date it
 * was looked at.
 *
 * The date is stamped rather than asked for — the app knows when this happened
 * — but it is carried on the card as well as in the history, because the
 * customer's workbook has a column for it and reads the latest value.
 *
 * @param {Record<string, any>} component
 * @param {{status?: string, user?: string, now?: number}} options
 */
export function recordComponentInspected(
  component,
  { status, user, now } = {},
) {
  const timestamp = typeof now === "number" ? now : Date.now();
  const inspectedAt = new Date(timestamp).toISOString();
  const nextStatus =
    status == null || status === "" ? component?.component_status : status;

  const inspected = {
    ...component,
    component_status: nextStatus,
    inspected_at: inspectedAt,
  };

  const changes = [];
  if (component?.component_status !== nextStatus) {
    changes.push({
      key: "component_status",
      from: component?.component_status ?? null,
      to: nextStatus ?? null,
    });
  }

  return withEntry(
    inspected,
    entry({
      action: COMPONENT_HISTORY_ACTIONS.INSPECTED,
      user,
      now: timestamp,
      to: nextStatus ?? null,
      ...(changes.length > 0 ? { changes } : {}),
    }),
  );
}

/** Whether a name has been set, and so whether the registry can be written to. */
export function canWriteRegistry(userProfile) {
  return String(userProfile?.name ?? "").trim().length > 0;
}
