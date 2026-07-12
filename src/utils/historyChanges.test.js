import { buildLeakHistoryChanges } from "./historyChanges";

describe("buildLeakHistoryChanges", () => {
  it("records changed edited fields", () => {
    const changes = buildLeakHistoryChanges({
      before: { note: "old", leak_speed: 10 },
      after: { note: "new", leak_speed: 10 },
      fields: [{ key: "note" }, { key: "leak_speed" }],
    });

    expect(changes).toEqual([{ key: "note", from: "old", to: "new" }]);
  });

  it("records selected photo changes without storing paths", () => {
    const changes = buildLeakHistoryChanges({
      before: { photo: "old/path.jpg" },
      after: { photo: "new/path.jpg" },
      includeKeys: ["photo"],
    });

    expect(changes).toEqual([
      { key: "photo", kind: "photo", from: true, to: true },
    ]);
  });

  it("records auto-updated included fields", () => {
    const changes = buildLeakHistoryChanges({
      before: { priority: "low" },
      after: { priority: "high" },
      includeKeys: ["priority"],
    });

    expect(changes).toEqual([{ key: "priority", from: "low", to: "high" }]);
  });

  it("skips unchanged values", () => {
    const changes = buildLeakHistoryChanges({
      before: { note: "same", count: 1 },
      after: { note: "same", count: "1" },
      fields: [{ key: "note" }, { key: "count" }],
    });

    expect(changes).toEqual([]);
  });
});
