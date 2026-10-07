import { COMPONENT_HISTORY_ACTIONS } from "./componentHistory";

/**
 * Правка записанных сверок компонента из его карточки.
 *
 * Правится то, что осмотр ответил: в каком состоянии нашли железо и
 * замечание. Дата, кто сверял, номер сверки и снимок остаются как записаны:
 * по ним считают, сверен ли компонент в обходе.
 *
 * Состояние последнего осмотра — состояние карточки, как после нового
 * осмотра. Если же в той же правке состояние карточки поменяли руками,
 * побеждает ручное: его человек выбрал прямо. Правка старой сверки состояние
 * не трогает.
 */
export const RECONCILE_EDIT_KEYS = Object.freeze(["to", "comment"]);

/** Ключ записи — её место в истории: своего номера у записей нет. */
export const reconcileKey = (index) => `h${index}`;

/** Сверки карточки — новые сверху, с ключом для правок. */
export function reconcileEntries(component) {
  const history = Array.isArray(component?.history) ? component.history : [];
  return history
    .map((entry, index) => ({ entry, key: reconcileKey(index) }))
    .filter(
      ({ entry }) => entry?.action === COMPONENT_HISTORY_ACTIONS.INSPECTED,
    )
    .reverse();
}

function normalize(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function diffEntry(entry, patch) {
  if (!patch) return [];
  return RECONCILE_EDIT_KEYS.filter((key) => key in patch)
    .map((key) => ({
      key,
      from: normalize(entry?.[key]),
      to: normalize(patch[key]),
    }))
    .filter(({ from, to }) => (from ?? null) !== (to ?? null));
}

/** Есть ли в черновике хоть одна настоящая правка. */
export function hasReconcileEdits(component, edits) {
  if (!edits || Object.keys(edits).length === 0) return false;
  return reconcileEntries(component).some(
    ({ entry, key }) => diffEntry(entry, edits[key]).length > 0,
  );
}

/**
 * Применяет черновик к карточке.
 *
 * @param {any} card карточка с правками полей (черновик листа)
 * @param {Record<string, Record<string, any>>} edits правки по ключу записи
 * @param {any} [original] карточка до правки — понять, правили ли состояние
 * @returns {{ component: any, changes: any[] }} карточка и изменения для истории
 */
export function applyReconcileEdits(card, edits, original = card) {
  if (!edits || Object.keys(edits).length === 0) {
    return { component: card, changes: [] };
  }

  const changes = [];
  const stateEditedAt = new Set();
  const history = (Array.isArray(card?.history) ? card.history : []).map(
    (entry, index) => {
      if (entry?.action !== COMPONENT_HISTORY_ACTIONS.INSPECTED) return entry;
      const diff = diffEntry(entry, edits[reconcileKey(index)]);
      if (diff.length === 0) return entry;
      const next = { ...entry };
      if (diff.some((change) => change.key === "to")) stateEditedAt.add(index);
      for (const change of diff) {
        if (change.to === undefined) delete next[change.key];
        else next[change.key] = change.to;
        changes.push({
          ...change,
          record: { kind: "reconcile", date: entry.date },
        });
      }
      return next;
    },
  );
  if (changes.length === 0) return { component: card, changes: [] };

  let component = { ...card, history };
  let latestIndex = -1;
  history.forEach((entry, index) => {
    if (entry?.action === COMPONENT_HISTORY_ACTIONS.INSPECTED) {
      latestIndex = index;
    }
  });
  const stateEdited = stateEditedAt.has(latestIndex);
  const statusUntouched =
    (card?.component_status ?? null) === (original?.component_status ?? null);
  const latestState = history[latestIndex]?.to;
  if (stateEdited && statusUntouched && latestState) {
    // Само изменение поля состояния попадёт в историю обычной правкой поля.
    component = { ...component, component_status: latestState };
  }

  return { component, changes };
}
