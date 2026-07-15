import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isNative: false }));
const filesystem = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  deleteFile: vi.fn(),
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return platform.isNative;
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: filesystem,
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
}));
vi.mock("@/utils/logger", () => ({ logger }));

import { deletePhotoFromFS, getPhotoSrc, photoExists } from "./photoService";

describe("photoService", () => {
  beforeEach(() => {
    platform.isNative = false;
    vi.clearAllMocks();
  });

  it("uses browser-native photo values without filesystem access", async () => {
    const dataUrl = "data:image/jpeg;base64,abc";
    expect(await getPhotoSrc(dataUrl)).toBe(dataUrl);
    expect(await photoExists(dataUrl)).toBe(true);
    expect(await photoExists("https://example.test/photo.jpg")).toBe(false);
    await deletePhotoFromFS(dataUrl);
    expect(filesystem.deleteFile).not.toHaveBeenCalled();
  });

  it("reads current data paths and legacy document paths on native", async () => {
    platform.isNative = true;
    filesystem.readFile.mockResolvedValue({ data: "encoded" });

    expect(await getPhotoSrc("data://LeakReports/current.jpg")).toBe(
      "data:image/jpeg;base64,encoded",
    );
    expect(filesystem.readFile).toHaveBeenLastCalledWith({
      path: "LeakReports/current.jpg",
      directory: "DATA",
    });

    await getPhotoSrc("Documents/LeakReports/legacy.jpg");
    expect(filesystem.readFile).toHaveBeenLastCalledWith({
      path: "LeakReports/legacy.jpg",
      directory: "DOCUMENTS",
    });
  });

  it("returns safe fallbacks when native files are missing", async () => {
    platform.isNative = true;
    filesystem.readFile.mockRejectedValue(new Error("missing"));
    filesystem.stat.mockRejectedValue(new Error("missing"));

    expect(await getPhotoSrc("data://missing.jpg")).toBeNull();
    expect(await photoExists("data://missing.jpg")).toBe(false);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("checks and deletes native photos in their correct directory", async () => {
    platform.isNative = true;
    filesystem.stat.mockResolvedValue({ type: "file" });
    filesystem.deleteFile.mockResolvedValue(undefined);

    expect(await photoExists("data://folder/photo.jpg")).toBe(true);
    await deletePhotoFromFS("data://folder/photo.jpg");
    expect(filesystem.stat).toHaveBeenCalledWith({
      path: "folder/photo.jpg",
      directory: "DATA",
    });
    expect(filesystem.deleteFile).toHaveBeenCalledWith({
      path: "folder/photo.jpg",
      directory: "DATA",
    });
  });
});
