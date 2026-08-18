/**
 * Merging component registries written on different devices.
 *
 * Two people walking in parallel are handed no number ranges and cannot see
 * each other's cards, so both start at 1 and both reach a hundred. Colliding
 * numbers are the expected outcome here, not an edge case — which is why this
 * merge never resolves one on its own.
 *
 * The rule throughout: a card somebody walked out to a wellhead to write must
 * survive the merge. Anything ambiguous is kept and reported, never dropped,
 * never silently renumbered, never folded into its namesake.
 */

/** Same record, seen twice: the UUID is stable across devices. */
function isSameRecord(a, b) {
  return a?.id != null && a.id === b?.id;
}

function changedAt(component) {
  const value = Number(component?.updatedAt ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Picks between two copies of one record.
 *
 * Last write wins on the whole card rather than field by field. A component
 * card is filled in one sitting in front of the equipment; merging halves of
 * two sittings would produce a card that describes nothing that was ever
 * actually seen.
 */
function pickNewer(mine, theirs) {
  return changedAt(theirs) > changedAt(mine) ? theirs : mine;
}

function uidOf(component) {
  return String(component?.component_uid ?? "").trim();
}

/**
 * @typedef {{
 *   uid: string,
 *   records: object[],
 * }} ComponentUidConflict
 */

/**
 * @param {object[]} local what this device holds
 * @param {object[]} incoming what arrived from another device
 * @returns {{
 *   merged: object[],
 *   added: number,
 *   updated: number,
 *   conflicts: ComponentUidConflict[],
 * }}
 */
export function mergeComponentRegistries(local = [], incoming = []) {
  const merged = [...local];
  const byId = new Map(
    merged.map((component, index) => [component?.id, index]),
  );

  let added = 0;
  let updated = 0;

  for (const candidate of incoming) {
    if (!candidate) continue;

    const existingIndex = byId.get(candidate.id);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      if (!isSameRecord(existing, candidate)) continue;

      const winner = pickNewer(existing, candidate);
      if (winner !== existing) {
        merged[existingIndex] = winner;
        updated += 1;
      }
      continue;
    }

    // A number already in use is not grounds for rejecting the card. Both
    // stay, and a human decides which one gets renumbered.
    merged.push(candidate);
    byId.set(candidate.id, merged.length - 1);
    added += 1;
  }

  return { merged, added, updated, conflicts: findUidConflicts(merged) };
}

/**
 * Groups of distinct records sharing one identity number.
 *
 * Computed over the merged result rather than tracked during the merge, so a
 * collision that predates it — two cards typed on the same device by mistake —
 * surfaces the same way as one that arrived from elsewhere.
 *
 * @param {object[]} components
 * @returns {ComponentUidConflict[]}
 */
export function findUidConflicts(components = []) {
  const byUid = new Map();

  for (const component of components) {
    const uid = uidOf(component);
    if (!uid) continue;
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(component);
  }

  const conflicts = [];
  for (const [uid, records] of byUid) {
    if (records.length > 1) conflicts.push({ uid, records });
  }

  // Numerically, so the list reads in the order somebody would walk it.
  return conflicts.sort((a, b) => Number(a.uid) - Number(b.uid));
}

/**
 * Whether a registry needs a human before it can be trusted as a report.
 * @param {object[]} components
 */
export function hasUnresolvedConflicts(components = []) {
  return findUidConflicts(components).length > 0;
}
