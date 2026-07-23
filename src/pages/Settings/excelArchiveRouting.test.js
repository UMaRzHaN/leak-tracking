import { describe, expect, it } from "vitest";
import { resolvePortableExcelArchiveRoute } from "./excelArchiveRouting";

const portableResult = {
  portableArchive: true,
  project: { name: "ФАО", type: "midstream", syncId: "fao-sync-id" },
};

describe("portable Excel archive routing", () => {
  it("creates a separate project when archive metadata differs from active", () => {
    expect(
      resolvePortableExcelArchiveRoute({
        result: portableResult,
        projects: [{ id: "upstream", name: "Upstream", type: "upstream" }],
        activeProject: { id: "upstream", name: "Upstream" },
      }),
    ).toMatchObject({
      action: "create",
      name: "ФАО",
      archiveProject: { type: "midstream" },
    });
  });

  it("keeps the conflict flow when the active project really matches", () => {
    expect(
      resolvePortableExcelArchiveRoute({
        result: portableResult,
        projects: [{ id: "fao", name: " фао " }],
        activeProject: { id: "fao", name: "ФАО" },
      }).action,
    ).toBe("current");
  });

  it("uses a unique copy name when the matching project is not active", () => {
    expect(
      resolvePortableExcelArchiveRoute({
        result: portableResult,
        projects: [
          { id: "upstream", name: "Upstream" },
          { id: "fao", name: "ФАО" },
          { id: "copy", name: "ФАО (Excel)" },
        ],
        activeProject: { id: "upstream", name: "Upstream" },
      }).name,
    ).toBe("ФАО (Excel 2)");
  });
});
