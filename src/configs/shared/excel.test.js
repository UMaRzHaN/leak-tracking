import { describe, expect, it } from "vitest";

import { PROJECTS } from "@/configs/projects";
import {
  splitExcelColumns,
  validateExcelColumns,
  withRequiredExcelColumns,
  withRequiredExcelFields,
} from "./excel";

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

  it("derives headers and keys from unified column definitions", () => {
    const columns = [
      { key: "date", header: "Date" },
      { key: "leak_id", header: "Leak ID" },
    ];

    expect(splitExcelColumns(columns)).toEqual({
      headers: ["Date", "Leak ID"],
      keysOrder: ["date", "leak_id"],
    });

    const result = withRequiredExcelColumns(columns);
    expect(result.keysOrder).toContain("time");
    expect(result.keysOrder).toContain("gasPercentage");
    expect(result.headers[result.keysOrder.indexOf("gasPercentage")]).toBe(
      "Содержание газа в смеси, %",
    );
  });
});

describe("колонки времени у починки", () => {
  // Формат даты в книге показывает только день. Починка, начатая и
  // законченная в одни сутки, без часов выглядела мгновенной, а у даты
  // обнаружения время отдельной колонкой стояло с самого начала.
  it("ставит время сразу за своей датой", () => {
    const { keysOrder } = withRequiredExcelFields(
      ["№", "Дата обнаружения", "Статус", "Дата устранения"],
      ["index", "date", "status", "resolvedAt"],
    );

    expect(keysOrder[keysOrder.indexOf("repairAt") + 1]).toBe("repairTime");
    expect(keysOrder[keysOrder.indexOf("resolvedAt") + 1]).toBe("resolvedTime");
  });

  it("даёт им заголовки по-русски", () => {
    const { headers, keysOrder } = withRequiredExcelFields(
      ["№", "Статус", "Дата устранения"],
      ["index", "status", "resolvedAt"],
    );

    expect(headers[keysOrder.indexOf("repairTime")]).toBe("Время ремонта");
    expect(headers[keysOrder.indexOf("resolvedTime")]).toBe("Время устранения");
  });
});
