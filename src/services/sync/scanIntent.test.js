import { describe, expect, it } from "vitest";
import { resolveScanIntent } from "./scanIntent";

const PROJECT = { type: "upstream", name: "Alpha", syncId: "sync-alpha-1234" };

describe("resolveScanIntent", () => {
  it("synchronizes when the code carries the open project's database", () => {
    expect(resolveScanIntent({ syncId: "sync-alpha-1234" }, PROJECT)).toBe(
      "sync",
    );
  });

  it("imports when the code carries another database", () => {
    expect(resolveScanIntent({ syncId: "sync-beta-9999" }, PROJECT)).toBe(
      "import",
    );
  });

  it("imports when no project is open", () => {
    expect(resolveScanIntent({ syncId: "sync-alpha-1234" }, null)).toBe(
      "import",
    );
  });

  it("keeps synchronizing a renamed project, because syncId outlives the name", () => {
    expect(
      resolveScanIntent(
        { syncId: "sync-alpha-1234", projectKey: "upstream:old name" },
        PROJECT,
      ),
    ).toBe("sync");
  });

  it("falls back to type and name for a project predating syncId", () => {
    const legacy = { type: "upstream", name: "Alpha" };
    expect(resolveScanIntent({ projectKey: "upstream:alpha" }, legacy)).toBe(
      "sync",
    );
    expect(resolveScanIntent({ projectKey: "downstream:alpha" }, legacy)).toBe(
      "import",
    );
    expect(resolveScanIntent({ syncId: "sync-alpha-1234" }, legacy)).toBe(
      "import",
    );
  });

  it("imports rather than guessing when the code identifies nothing", () => {
    expect(resolveScanIntent({}, PROJECT)).toBe("import");
    expect(resolveScanIntent(null, PROJECT)).toBe("import");
    expect(resolveScanIntent({ syncId: "   " }, PROJECT)).toBe("import");
  });
});
