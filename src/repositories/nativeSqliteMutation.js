function indexRecords(records) {
  if (!Array.isArray(records)) return null;
  const map = new Map();
  const order = [];
  for (const record of records) {
    if (
      !record ||
      typeof record !== "object" ||
      !(typeof record.id === "string" || typeof record.id === "number")
    ) {
      return null;
    }
    const key = String(record.id);
    if (!key || map.has(key)) return null;
    map.set(key, record);
    order.push(key);
  }
  return { map, order };
}

function recordsEqual(left, right) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createNativeSqliteMutation(previous, next) {
  const previousIndex = indexRecords(previous);
  const nextIndex = indexRecords(next);
  if (!previousIndex || !nextIndex) return null;

  const deletedIds = previousIndex.order.filter((id) => !nextIndex.map.has(id));
  const expectedOrder = [
    ...previousIndex.order.filter((id) => nextIndex.map.has(id)),
    ...nextIndex.order.filter((id) => !previousIndex.map.has(id)),
  ];
  if (
    expectedOrder.length !== nextIndex.order.length ||
    expectedOrder.some((id, index) => id !== nextIndex.order[index])
  ) {
    return null;
  }

  const upserts = [];
  for (const id of nextIndex.order) {
    const nextRecord = nextIndex.map.get(id);
    const previousRecord = previousIndex.map.get(id);
    if (!previousRecord || !recordsEqual(previousRecord, nextRecord)) {
      upserts.push(nextRecord);
    }
  }

  return { upserts, deletedIds };
}

export function shouldReplaceNativeSqliteDataset(
  mutation,
  nextLength,
  { maxChangedRecords = 1000, maxChangedRatio = 0.5 } = {},
) {
  if (!mutation) return true;
  const changed = mutation.upserts.length + mutation.deletedIds.length;
  return (
    changed > maxChangedRecords ||
    (nextLength >= 500 && changed / Math.max(nextLength, 1) > maxChangedRatio)
  );
}
