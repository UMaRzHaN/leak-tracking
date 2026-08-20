import { logger } from "@/utils/logger";

/**
 * Handler for a promise whose failure must not fail the work around it, but
 * must not disappear either.
 *
 * These are cleanups and teardowns: deleting a photo nothing references any
 * more, stopping a sync session on a path that is already ending, removing a
 * scanner listener. Letting one of them reject would report a failure for work
 * that actually succeeded — which is why they were written as
 * `.catch(() => {})`.
 *
 * The empty handler went one step too far: an orphaned photo, a session left
 * hosting, a listener still attached all became invisible, including in the
 * diagnostics a reader can export from the error screen. `logger.warn` keeps
 * them there and still stays out of the user's way.
 *
 * @param {string} scope where the failure happened, in the same
 * `[area.action]` form the rest of the logging uses
 */
export function ignoredError(scope) {
  return (error) => logger.warn(`[${scope}] ignored failure:`, error);
}
