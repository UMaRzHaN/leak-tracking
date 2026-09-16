import { getLeakMergeIdentity } from "@/services/sync/projectSyncState";
import { normalizeLeakTag } from "@/utils/leakIdentity";

/**
 * Какая местная утечка стоит на месте каждой приезжей.
 *
 * Номер утечки проставлен человеком и переживает круг через Excel, где
 * внутренний `id` назначается заново, — поэтому объединение и опознавало
 * утечку по номеру. Но номер не уникален: в поле встречаются две утечки с
 * одним номером. Под одним ключом они затирали друг друга, и объединение
 * превращало одну в копию другой.
 *
 * Поэтому сначала точная пара — тот же `id` и тот же номер. Номер сам по себе
 * опознаёт только там, где точной пары нет, и каждую местную утечку отдаёт не
 * больше одного раза. Местная утечка, чей `id` приехал в архиве, по номеру не
 * отдаётся вовсе: у неё есть своя пара, даже если ту отсеяли до слияния.
 *
 * Синхронизация опознаёт по `id`, как и прежде: номер там правят, и запись с
 * новым номером остаётся той же записью.
 *
 * @param {any[]} existing
 * @param {any[]} incoming
 * @param {{source?: string, allIncoming?: any[]}} [options] `allIncoming` —
 *   весь архив, если сопоставляется его часть
 * @returns {number[]} индекс местной утечки для каждой приезжей или -1
 */
export function matchIncomingLeaks(existing = [], incoming = [], options = {}) {
  if (options.source === "sync") {
    const indexByIdentity = new Map();
    existing.forEach((leak, index) => {
      const identity = getLeakMergeIdentity(leak);
      if (identity) indexByIdentity.set(identity, index);
    });
    return incoming.map(
      (leak) => indexByIdentity.get(getLeakMergeIdentity(leak)) ?? -1,
    );
  }

  const exactKey = (leak) =>
    leak?.id == null
      ? null
      : `${String(leak.id)}|${normalizeLeakTag(leak?.leak_id)}`;
  const exact = new Map();
  const byTag = new Map();
  existing.forEach((leak, index) => {
    const key = exactKey(leak);
    if (key != null && !exact.has(key)) exact.set(key, index);
    const tag = normalizeLeakTag(leak?.leak_id);
    if (!tag) return;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(index);
  });

  const arrivedIds = new Set(
    (options.allIncoming ?? incoming)
      .filter((leak) => leak?.id != null)
      .map((leak) => String(leak.id)),
  );
  const claimed = new Set();
  const matches = incoming.map((leak) => {
    const key = exactKey(leak);
    const index = key == null ? undefined : exact.get(key);
    if (index != null) claimed.add(index);
    return index ?? -1;
  });

  return matches.map((match, position) => {
    if (match >= 0) return match;
    const tag = normalizeLeakTag(incoming[position]?.leak_id);
    const index = (byTag.get(tag) ?? []).find(
      (candidate) =>
        !claimed.has(candidate) &&
        !(
          existing[candidate]?.id != null &&
          arrivedIds.has(String(existing[candidate].id))
        ),
    );
    if (index == null) return -1;
    claimed.add(index);
    return index;
  });
}
