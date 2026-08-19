import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { openSchemaExternally } = await import("./openSchemaExternally");

const schema = { id: "s1", name: "узел.pdf", type: "application/pdf" };
const project = { id: "p1", folderName: "b" };

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:drawing");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("handing a PDF to the browser", () => {
  it("points the tab the caller already claimed at the file", async () => {
    const targetWindow = { closed: false, location: { replace: vi.fn() } };

    await openSchemaExternally(project, schema, new Blob(["pdf"]), {
      targetWindow,
    });

    expect(targetWindow.location.replace).toHaveBeenCalledWith("blob:drawing");
  });

  it("still reports a block when there was no tab to point anywhere", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    await expect(
      openSchemaExternally(project, schema, new Blob(["pdf"])),
    ).rejects.toMatchObject({ code: "SCHEMA_OPEN_BLOCKED" });

    openSpy.mockRestore();
  });
});
