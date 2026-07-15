import { describe, expect, it } from "vitest";

import { PROJECTS } from "@/configs/projects";
import { validateExcelColumns, withRequiredExcelFields } from "./excel";

describe("excel config helpers", () => {
  it("rejects mismatched headers and keys", () => {
    expect(() => validateExcelColumns(["A"], ["a", "b"])).toThrow(
      /1 headers for 2 keys/,
    );
  });

  it("rejects duplicate keys", () => {
    expect(() => validateExcelColumns(["A", "B"], ["a", "a"])).toThrow(
      /duplicate keys: a/,
    );
  });

  it("keeps project excel configs structurally valid", () => {
    for (const projectConfig of Object.values(PROJECTS)) {
      const { headers, keysOrder } = projectConfig.export.excel;

      expect(() => validateExcelColumns(headers, keysOrder)).not.toThrow();
      expect(headers).toHaveLength(keysOrder.length);
    }
  });

  it("validates base columns before adding required fields", () => {
    expect(() => withRequiredExcelFields(["A", "B"], ["date", "date"])).toThrow(
      /duplicate keys: date/,
    );
  });
});
