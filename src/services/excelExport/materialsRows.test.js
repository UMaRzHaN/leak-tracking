import { describe, expect, it } from "vitest";
import { getMaterialsExportRows } from "./materialsRows";

describe("getMaterialsExportRows", () => {
  it("gathers materials from repairs and inspections in time order", () => {
    const leak = {
      id: 1,
      index: 1,
      leak_id: "A-1",
      events: [
        {
          id: "s",
          type: "repair_started",
          date: "2026-03-05T08:00:00.000Z",
          user: "Brigade",
        },
        {
          id: "d",
          type: "repair_done",
          date: "2026-03-05T12:00:00.000Z",
          materials_equipment: "Gasket × 2",
        },
        {
          id: "i",
          type: "inspection",
          date: "2026-03-01T09:00:00.000Z",
          monitoredBy: "Inspector",
          materials_equipment: "Clamp",
        },
        {
          id: "i2",
          type: "inspection",
          date: "2026-03-02T09:00:00.000Z",
        },
      ],
    };

    const rows = getMaterialsExportRows([leak]);
    expect(rows.map((row) => [row.source, row.materials_equipment])).toEqual([
      ["monitoring", "Clamp"],
      ["repair", "Gasket × 2"],
    ]);
  });
});
