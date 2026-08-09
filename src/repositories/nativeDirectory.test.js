import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { mkdir: vi.fn() },
}));

const { isDirectoryExistsError, ensureNativeDirectory } =
  await import("./nativeDirectory");
const { Filesystem } = await import("@capacitor/filesystem");

describe("isDirectoryExistsError", () => {
  it("recognises the native plugin code", () => {
    expect(isDirectoryExistsError({ code: "OS-PLUG-FILE-0010" })).toBe(true);
  });

  it("recognises both message spellings", () => {
    // Native says "already exists", the web implementation says
    // "does already exist" and sets no code.
    expect(isDirectoryExistsError(new Error("Directory already exists"))).toBe(
      true,
    );
    expect(
      isDirectoryExistsError(
        new Error("Current directory does already exist."),
      ),
    ).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isDirectoryExistsError(new Error("Permission denied"))).toBe(false);
    expect(isDirectoryExistsError(new Error("No space left on device"))).toBe(
      false,
    );
  });
});

describe("ensureNativeDirectory", () => {
  it("treats an existing directory as success", async () => {
    Filesystem.mkdir.mockRejectedValueOnce(
      new Error("Current directory does already exist."),
    );

    await expect(ensureNativeDirectory("a/b", "DATA")).resolves.toBe("a/b");
  });

  it("rethrows anything else", async () => {
    Filesystem.mkdir.mockRejectedValueOnce(new Error("Permission denied"));

    await expect(ensureNativeDirectory("a/b", "DATA")).rejects.toThrow(
      "Permission denied",
    );
  });
});
