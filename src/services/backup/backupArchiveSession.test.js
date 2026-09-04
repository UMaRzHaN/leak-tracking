import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/excel/backupArchiveWorkerClient", () => ({
  openBackupArchiveInWorker: vi.fn(),
  isWorkerUnavailableError: (error) => error?.name === "WorkerUnavailableError",
}));
vi.mock("./archiveParser", () => ({ parseBackupZip: vi.fn() }));

const { openArchive } = await import("./backupArchiveSession");
const { openBackupArchiveInWorker } =
  await import("@/services/excel/backupArchiveWorkerClient");
const { parseBackupZip } = await import("./archiveParser");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("openArchive", () => {
  it("wraps the worker session in a reader the caller cannot distinguish", async () => {
    const blob = new Blob(["x"]);
    const readPhoto = vi.fn().mockResolvedValue(blob);
    openBackupArchiveInWorker.mockResolvedValue({
      leaks: [{ id: 1 }],
      meta: { project: { name: "P" } },
      sizes: { "zip:a.jpg": 9 },
      readPhoto,
    });

    const archive = await openArchive("file");

    expect(archive.leaks).toEqual([{ id: 1 }]);
    expect(archive.meta).toEqual({ project: { name: "P" } });
    expect(archive.photos.declaredSize("zip:a.jpg")).toBe(9);
    await expect(archive.photos.read("zip:a.jpg")).resolves.toBe(blob);
    // sizes and readPhoto are transport details, not part of the contract
    expect(archive.sizes).toBeUndefined();
    expect(archive.readPhoto).toBeUndefined();
    expect(parseBackupZip).not.toHaveBeenCalled();
  });

  it("parses locally when the worker cannot run", async () => {
    const unavailable = new Error("no workers");
    unavailable.name = "WorkerUnavailableError";
    openBackupArchiveInWorker.mockRejectedValue(unavailable);
    parseBackupZip.mockResolvedValue({
      leaks: [],
      photos: { has: () => false },
    });

    const archive = await openArchive("file");

    expect(parseBackupZip).toHaveBeenCalledWith("file");
    expect(archive.photos.has("zip:a.jpg")).toBe(false);
  });

  it("does not reparse an archive the worker rejected", async () => {
    openBackupArchiveInWorker.mockRejectedValue(
      new Error("Файл backup.json не найден в архиве"),
    );

    await expect(openArchive("file")).rejects.toThrow("backup.json");
    expect(parseBackupZip).not.toHaveBeenCalled();
  });
});
