import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_STATUS,
  addBatch,
  createInvoice,
  mergeInvoices,
  receivedItems,
  summarizeInvoice,
} from "./equipmentAcceptance";

const first = () =>
  createInvoice({
    number: "М-11 № 4471",
    supplier: "ТОО «КазТрубМаш»",
    warehouse: "Газли",
    user: "Ким С. В.",
    now: Date.parse("2026-10-05T08:20:00Z"),
    lines: [
      { name: "Задвижка Dn-200 Pn-16", unit: "pcs", ordered: 2, qty: 2 },
      {
        name: "Шпилька М20×140",
        unit: "pcs",
        ordered: 8,
        qty: 6,
        dnpnMatch: false,
        remark: "Pn-25 вместо Pn-16",
      },
    ],
  });

describe("equipment acceptance", () => {
  it("counts what came against what was ordered", () => {
    const summary = summarizeInvoice(first());

    expect(summary).toMatchObject({
      status: ACCEPTANCE_STATUS.PARTIAL,
      ordered: 10,
      received: 8,
      left: 2,
      batches: 1,
      hasRemark: true,
    });
  });

  it("closes the invoice once the next batch brings the rest", () => {
    const invoice = first();
    const studs = invoice.items[1];
    const next = addBatch(invoice, [{ itemId: studs.id, qty: 2 }], {
      now: Date.parse("2026-10-06T08:00:00Z"),
    });

    expect(summarizeInvoice(next)).toMatchObject({
      status: ACCEPTANCE_STATUS.ACCEPTED,
      left: 0,
      batches: 2,
    });
  });

  it("adds an item that was not on the invoice and skips empty lines", () => {
    const next = addBatch(first(), [
      { name: "Гайка М20", unit: "pcs", ordered: 8, qty: 6 },
      { itemId: "nothing", qty: 0 },
    ]);
    expect(next.items.map((item) => item.name)).toContain("Гайка М20");
    expect(next.batches[next.batches.length - 1].lines).toHaveLength(1);
  });

  it("offers only received items as materials for a repair", () => {
    const items = receivedItems([first()]);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      name: "Шпилька М20×140",
      invoice: "М-11 № 4471",
      available: 6,
    });
  });

  it("merges by id and keeps the fresher invoice", () => {
    const local = first();
    const newer = { ...local, updatedAt: "2030-01-01T00:00:00Z", number: "X" };
    const other = { ...first(), id: "other" };

    const merged = mergeInvoices([local], [newer, other]);
    expect(merged).toHaveLength(2);
    expect(merged.find((invoice) => invoice.id === local.id).number).toBe("X");
  });

  it("skips broken invoices instead of failing the whole import", () => {
    // `acceptances: [null]` в project.json ронял слияние TypeError, и откат
    // уносил весь импорт — вместе с утечками.
    const local = first();
    const merged = mergeInvoices(
      [local, null],
      [null, "мусор", { id: 7 }, { ...first(), id: "other" }],
    );
    expect(merged.map((invoice) => invoice.id)).toEqual([local.id, "other"]);
  });
});
