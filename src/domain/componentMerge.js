import {
  compactComponentTombstones,
  componentChangedAt,
  isComponentTombstone,
  isLiveComponent,
} from "@/domain/componentTombstones";

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
 *
 * Единственное, что карточку из реестра всё-таки убирает, — запись о её
 * удалении, приехавшая вместе с ней; см. componentTombstones. Без этого
 * удаление не переживало ни одного обмена: для второго устройства карточка
 * просто есть, и первый же обмен возвращал её обратно.
 */

/** Same record, seen twice: the UUID is stable across devices. */
function isSameRecord(a, b) {
  return a?.id != null && a.id === b?.id;
}

/**
 * Picks between two copies of one record.
 *
 * Last write wins on the whole card rather than field by field. A component
 * card is filled in one sitting in front of the equipment; merging halves of
 * two sittings would produce a card that describes nothing that was ever
 * actually seen.
 *
 * Надгробие и карточка сравниваются тем же числом: удалили или правили —
 * важно, что случилось позже. На равенстве побеждает удаление: человек, чьё
 * решение мы не можем упорядочить, скорее переживёт лишний раз заведённую
 * карточку, чем ту, что он удалил и которая вернулась.
 */
function pickNewer(mine, theirs) {
  const mineAt = componentChangedAt(mine);
  const theirsAt = componentChangedAt(theirs);
  if (theirsAt !== mineAt) return theirsAt > mineAt ? theirs : mine;
  return isComponentTombstone(theirs) ? theirs : mine;
}

function uidOf(component) {
  return String(component?.component_uid ?? "").trim();
}

/**
 * @typedef {{
 *   uid: string,
 *   records: Record<string, any>[],
 * }} ComponentUidConflict
 */

/**
 * @param {Record<string, any>[]} local what this device holds
 * @param {Record<string, any>[]} incoming what arrived from another device
 * @returns {{
 *   merged: Record<string, any>[],
 *   added: number,
 *   updated: number,
 *   removed: number,
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
  let removed = 0;

  for (const candidate of incoming) {
    if (!candidate) continue;

    const existingIndex = byId.get(candidate.id);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      if (!isSameRecord(existing, candidate)) continue;

      const winner = pickNewer(existing, candidate);
      if (winner !== existing) {
        merged[existingIndex] = winner;
        if (isComponentTombstone(winner) && isLiveComponent(existing)) {
          removed += 1;
        } else {
          updated += 1;
        }
      }
      continue;
    }

    // A number already in use is not grounds for rejecting the card. Both
    // stay, and a human decides which one gets renumbered.
    merged.push(candidate);
    byId.set(candidate.id, merged.length - 1);
    // Надгробие карточки, которой здесь никогда не было, — не «добавили»:
    // человеку показывать нечего, а нести его дальше всё равно надо, иначе
    // третье устройство вернёт удалённое обоим.
    if (isLiveComponent(candidate)) added += 1;
  }

  return {
    merged: compactComponentTombstones(merged),
    added,
    updated,
    removed,
    conflicts: findUidConflicts(merged),
  };
}

/**
 * Groups of distinct records sharing one identity number.
 *
 * Computed over the merged result rather than tracked during the merge, so a
 * collision that predates it — two cards typed on the same device by mistake —
 * surfaces the same way as one that arrived from elsewhere.
 *
 * @param {Record<string, any>[]} components
 * @returns {ComponentUidConflict[]}
 */
export function findUidConflicts(components = []) {
  const byUid = new Map();

  for (const component of components) {
    // Надгробие номер не занимает: у удалённой карточки его не с чем сличать.
    if (!isLiveComponent(component)) continue;
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
 * @param {Record<string, any>[]} components
 */
export function hasUnresolvedConflicts(components = []) {
  return findUidConflicts(components).length > 0;
}
