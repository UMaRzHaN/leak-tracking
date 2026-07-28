import { describe, expect, it } from "vitest";
import { prepareRows } from "./useDataBaseExport";

const t = (_key, options) => options?.defaultValue ?? "";

describe("prepareRows", () => {
  it("exports the effective gasPercentage snapshot", () => {
    const rows = prepareRows(
      [{ id: 1, calculationParams: { gasPercentage: 82.5 } }, { id: 2 }],
      "en",
      t,
      { gasPercentage: 100 },
    );

    expect(rows[0].gasPercentage).toBe(82.5);
    expect(rows[1].gasPercentage).toBe(100);
  });
});
