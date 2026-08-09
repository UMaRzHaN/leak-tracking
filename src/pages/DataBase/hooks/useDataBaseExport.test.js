import { describe, expect, it } from "vitest";
import { prepareRows } from "./useDataBaseExport";

const t = (_key, options) => options?.defaultValue ?? "";

describe("prepareRows", () => {
  it("exports the effective gasPercentage snapshot", () => {
    const rows = prepareRows(
      [{ id: 1, calculationParams: { gasPercentage: 82.5 } }, { id: 2 }],
      t,
      { gasPercentage: 100 },
    );

    expect(rows[0].gasPercentage).toBe(82.5);
    expect(rows[1].gasPercentage).toBe(100);
  });

  // The export used to render these through Intl before the Excel layer
  // parsed them back. On an English interface that round trip turned
  // 9 October into 10 September, because Intl writes `10/09/2026` and the
  // parser reads the leading number as the day. Handing the raw timestamp
  // over leaves nothing to misread.
  it("keeps timestamps raw instead of pre-formatting them", () => {
    const repairAt = Date.UTC(2026, 9, 9);
    const resolvedAt = Date.UTC(2026, 9, 11);
    const createdAt = Date.UTC(2026, 9, 9);

    const [row] = prepareRows(
      [{ id: 1, created_at: String(createdAt), repairAt, resolvedAt }],
      t,
      {},
    );

    expect(row.date).toBe(createdAt);
    expect(row.repairAt).toBe(repairAt);
    expect(row.resolvedAt).toBe(resolvedAt);
  });

  it("leaves missing timestamps empty rather than inventing a date", () => {
    const [row] = prepareRows([{ id: 1 }], t, {});

    expect(row.date).toBe("");
    expect(row.repairAt).toBe("");
    expect(row.resolvedAt).toBe("");
  });
});
