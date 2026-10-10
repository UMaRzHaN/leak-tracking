/**
 * Приёмка оборудования по накладным (7e–7h).
 *
 * Накладная — это позиции с заказанным количеством и партии, в которых они
 * приходили. Принятое считается по партиям, а не хранится отдельным полем:
 * так «принято 10 из 14» и «остаток 4» не могут разойтись с тем, что
 * записано в партиях.
 *
 * Справочника МТР нет — позиции вводят руками (7g), поэтому совпадение
 * позиций между партиями держится на id, а не на названии.
 */

export const ACCEPTANCE_STATUS = Object.freeze({
  PENDING: "pending",
  PARTIAL: "partial",
  ACCEPTED: "accepted",
});

export const UNITS = Object.freeze(["pcs", "set", "m", "kg", "l"]);

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toQty(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Сколько пришло по каждой позиции, по всем партиям. */
export function receivedByItem(invoice) {
  const received = new Map();
  for (const batch of invoice?.batches ?? []) {
    for (const line of batch.lines ?? []) {
      received.set(
        line.itemId,
        (received.get(line.itemId) ?? 0) + toQty(line.qty),
      );
    }
  }
  return received;
}

export function summarizeInvoice(invoice) {
  const received = receivedByItem(invoice);
  const items = invoice?.items ?? [];
  const ordered = items.reduce((sum, item) => sum + toQty(item.ordered), 0);
  const got = items.reduce(
    (sum, item) =>
      sum + Math.min(received.get(item.id) ?? 0, toQty(item.ordered)),
    0,
  );
  const batches = invoice?.batches ?? [];
  const hasRemark = batches.some((batch) =>
    (batch.lines ?? []).some(
      (line) =>
        line.remark || line.complete === false || line.dnpnMatch === false,
    ),
  );
  const status =
    got === 0
      ? ACCEPTANCE_STATUS.PENDING
      : got >= ordered
        ? ACCEPTANCE_STATUS.ACCEPTED
        : ACCEPTANCE_STATUS.PARTIAL;
  return {
    status,
    hasRemark,
    ordered,
    received: got,
    left: Math.max(0, ordered - got),
    batches: batches.length,
    lastBatchAt: batches.length ? batches[batches.length - 1].date : null,
  };
}

/**
 * Новая накладная вместе с первой партией.
 *
 * @param {{ number: string, supplier?: string, warehouse?: string,
 *   lines: Array<{ name: string, unit: string, ordered: number|string,
 *     qty: number|string, complete?: boolean, dnpnMatch?: boolean, remark?: string }>,
 *   user?: string, now?: number }} input
 */
export function createInvoice({
  number,
  supplier,
  warehouse,
  lines,
  user,
  now,
}) {
  const date = new Date(
    typeof now === "number" && Number.isFinite(now) ? now : Date.now(),
  ).toISOString();
  const items = lines.map((line) => ({
    id: newId("item"),
    name: line.name.trim(),
    unit: UNITS.includes(line.unit) ? line.unit : "pcs",
    ordered: toQty(line.ordered) || toQty(line.qty),
  }));
  return {
    id: newId("inv"),
    number: number.trim(),
    supplier: supplier?.trim() || undefined,
    warehouse: warehouse?.trim() || undefined,
    createdAt: date,
    updatedAt: date,
    items,
    batches: [
      {
        id: newId("batch"),
        date,
        ...(user ? { user } : {}),
        lines: lines.map((line, index) => batchLine(items[index].id, line)),
      },
    ],
  };
}

function batchLine(itemId, line) {
  return {
    itemId,
    qty: toQty(line.qty),
    complete: line.complete !== false,
    dnpnMatch: line.dnpnMatch !== false,
    ...(line.remark?.trim() ? { remark: line.remark.trim() } : {}),
  };
}

/**
 * Следующая партия по накладной. Новые позиции, которых в накладной не было,
 * дописываются в неё же.
 *
 * @param {any} invoice
 * @param {Array<{ itemId?: string, name?: string, unit?: string, ordered?: number|string,
 *   qty: number|string, complete?: boolean, dnpnMatch?: boolean, remark?: string }>} lines
 * @param {{ user?: string, now?: number }} [options]
 */
export function addBatch(invoice, lines, { user, now } = {}) {
  const date = new Date(
    typeof now === "number" && Number.isFinite(now) ? now : Date.now(),
  ).toISOString();
  const items = [...invoice.items];
  const batchLines = lines
    .filter((line) => toQty(line.qty) > 0)
    .map((line) => {
      let itemId = line.itemId;
      if (!itemId) {
        const item = {
          id: newId("item"),
          name: String(line.name ?? "").trim(),
          unit: UNITS.includes(line.unit ?? "") ? line.unit : "pcs",
          ordered: toQty(line.ordered) || toQty(line.qty),
        };
        items.push(item);
        itemId = item.id;
      }
      return batchLine(itemId, line);
    });
  if (!batchLines.length) return invoice;
  return {
    ...invoice,
    items,
    updatedAt: date,
    batches: [
      ...invoice.batches,
      {
        id: newId("batch"),
        date,
        ...(user ? { user } : {}),
        lines: batchLines,
      },
    ],
  };
}

/** Позиции, принятые по накладным, — источник «МТР по факту» в приёмке ремонта. */
export function receivedItems(invoices) {
  const result = [];
  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const received = receivedByItem(invoice);
    for (const item of invoice.items ?? []) {
      const available = received.get(item.id) ?? 0;
      if (available > 0) {
        result.push({
          id: `${invoice.id}:${item.id}`,
          name: item.name,
          unit: item.unit,
          invoice: invoice.number,
          available,
        });
      }
    }
  }
  return result;
}

/**
 * Слияние при импорте: по id, свежая накладная побеждает. Битые записи
 * отбрасываются до слияния: одна `null` в архиве иначе роняла бы TypeError, а
 * с ним откатывался бы весь импорт.
 */
export function mergeInvoices(current = [], incoming = []) {
  const valid = (list) =>
    (Array.isArray(list) ? list : []).filter(isValidInvoice);
  const byId = new Map(valid(current).map((invoice) => [invoice.id, invoice]));
  for (const invoice of valid(incoming)) {
    const existing = byId.get(invoice.id);
    if (
      !existing ||
      Date.parse(invoice.updatedAt ?? "") > Date.parse(existing.updatedAt ?? "")
    ) {
      byId.set(invoice.id, invoice);
    }
  }
  return [...byId.values()];
}

export function isValidInvoice(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.number === "string" &&
    Array.isArray(value.items) &&
    Array.isArray(value.batches),
  );
}
