import { describe, expect, it } from "vitest";
import { parseEmbeddedBackup } from "./embeddedBackup";

function makeWorkbook(rows, { includeSheet = true } = {}) {
  const sheet = {
    rowCount: rows.length,
    getRow(rowNumber) {
      const values = rows[rowNumber - 1] ?? [];
      return {
        getCell(columnNumber) {
          return { value: values[columnNumber - 1] };
        },
      };
    },
  };

  return {
    getWorksheet(name) {
      return includeSheet && name === "Project Backup" ? sheet : undefined;
    },
  };
}

describe("embedded Excel project backup", () => {
  it("returns null when the backup sheet or marker is absent", () => {
    expect(
      parseEmbeddedBackup(makeWorkbook([], { includeSheet: false })),
    ).toBeNull();
    expect(parseEmbeddedBackup(makeWorkbook([["Ordinary sheet"]]))).toBeNull();
  });

  it("reassembles ordered chunks and validates project metadata", () => {
    const payload = {
      schemaVersion: 1,
      project: {
        name: " Portable project ",
        type: "upstream",
        syncId: " sync-portable ",
      },
      vars: { methaneDensity: 0.7 },
      settings: { hiddenFields: ["note"], updatedAt: 123 },
      leaks: [{ id: 77, leak_id: "P-77", status: "open" }],
    };
    const serialized = JSON.stringify(payload);
    const splitAt = Math.floor(serialized.length / 2);
    const workbook = makeWorkbook([
      ["LEAK_TRACKER_EXCEL_BACKUP", 1],
      ["Chunk", "Payload"],
      [2, serialized.slice(splitAt)],
      [1, serialized.slice(0, splitAt)],
      [0, "ignored"],
    ]);

    const result = parseEmbeddedBackup(workbook);

    expect(result.project).toEqual({
      name: "Portable project",
      type: "upstream",
      syncId: "sync-portable",
    });
    expect(result.vars).toEqual({ methaneDensity: 0.7 });
    expect(result.settings).toEqual({
      hiddenFields: ["note"],
      updatedAt: 123,
    });
    expect(result.leaks).toEqual([
      expect.objectContaining({ id: 77, leak_id: "P-77", status: "open" }),
    ]);
  });

  it("keeps project null for legacy snapshots without project metadata", () => {
    const payload = JSON.stringify({
      leaks: [{ id: "legacy", status: "open" }],
    });
    const result = parseEmbeddedBackup(
      makeWorkbook([
        ["LEAK_TRACKER_EXCEL_BACKUP", 1],
        ["Chunk", "Payload"],
        [1, payload],
      ]),
    );

    expect(result.project).toBeNull();
    expect(result.leaks).toHaveLength(1);
  });

  it("rejects empty, invalid, and schema-incompatible backups", () => {
    expect(() =>
      parseEmbeddedBackup(
        makeWorkbook([
          ["LEAK_TRACKER_EXCEL_BACKUP", 1],
          ["Chunk", "Payload"],
        ]),
      ),
    ).toThrow("Project Backup sheet is empty");

    expect(() =>
      parseEmbeddedBackup(
        makeWorkbook([
          ["LEAK_TRACKER_EXCEL_BACKUP", 1],
          ["Chunk", "Payload"],
          [1, "not JSON"],
        ]),
      ),
    ).toThrow("Project Backup sheet contains invalid data");

    expect(() =>
      parseEmbeddedBackup(
        makeWorkbook([
          ["LEAK_TRACKER_EXCEL_BACKUP", 1],
          ["Chunk", "Payload"],
          [1, JSON.stringify({ leaks: "invalid" })],
        ]),
      ),
    ).toThrow();
  });
});
