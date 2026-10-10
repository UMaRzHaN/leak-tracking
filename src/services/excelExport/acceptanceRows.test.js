import { describe, expect, it } from "vitest";
import { addBatch, createInvoice } from "@/domain/equipmentAcceptance";
import { getAcceptanceExportRows } from "./acceptanceRows";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 1, 8);

function invoice() {
  const first = createInvoice({
    number: "М-11 № 4471",
    warehouse: "ЦПС",
    lines: [{ name: "Прокладка", unit: "pcs", ordered: 4, qty: 2 }],
    user: "Ким",
    now: START,
  });
  return addBatch(
    first,
    [{ itemId: first.items[0].id, qty: 2, remark: "Без паспорта" }],
    { user: "Ли", now: START + 3 * DAY },
  );
}

describe("getAcceptanceExportRows", () => {
  it("writes a row per item in every batch with totals so far", () => {
    const rows = getAcceptanceExportRows([invoice()]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      invoice: "М-11 № 4471",
      warehouse: "ЦПС",
      status: "accepted",
      batch: 1,
      name: "Прокладка",
      ordered: 4,
      qty: 2,
      received: 4,
      left: 0,
      user: "Ким",
    });
    expect(rows[1]).toMatchObject({ batch: 2, remark: "Без паспорта" });
  });

  it("keeps only the batches of the export period", () => {
    const rows = getAcceptanceExportRows([invoice()], {
      from: START + DAY,
      to: null,
    });
    expect(rows.map((row) => row.batch)).toEqual([2]);
  });
});
