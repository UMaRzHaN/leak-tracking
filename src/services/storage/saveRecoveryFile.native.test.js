import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ writePublicFile: vi.fn() }));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@/services/storage/publicFileWriter", () => ({
  writePublicFile: mocks.writePublicFile,
}));

const { saveRecoveryFile } = await import("./saveRecoveryFile");
const { RECOVERY_EXPORT_DIR } = await import("./exportFolders");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writePublicFile.mockResolvedValue(undefined);
});

describe("saveRecoveryFile на телефоне", () => {
  it("пишет файл в Документы, а не в пустую ссылку", async () => {
    // Ради этого правка и сделана: у WebView нет DownloadListener, и `<a
    // download>` здесь не делал ничего.
    const result = await saveRecoveryFile({
      fileName: "leak-tracking-diagnostics.json",
      text: '{"entries":[]}',
    });

    expect(mocks.writePublicFile).toHaveBeenCalledWith({
      folder: RECOVERY_EXPORT_DIR,
      fileName: "leak-tracking-diagnostics.json",
      blob: expect.any(Blob),
      mimeType: "application/json",
    });
    expect(result).toEqual({
      ok: true,
      fileName: "leak-tracking-diagnostics.json",
      path: `${RECOVERY_EXPORT_DIR}/leak-tracking-diagnostics.json`,
    });
  });

  it("не выпускает название проекта в путь разделителем", async () => {
    await saveRecoveryFile({
      fileName: "КС-12/куст 3-recovery.json",
      text: "{}",
    });

    expect(mocks.writePublicFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "КС-12-куст 3-recovery.json" }),
    );
  });

  it("возвращает отказ записи, а не бросает его на экран поломки", async () => {
    mocks.writePublicFile.mockRejectedValue(new Error("нет места"));

    const result = await saveRecoveryFile({
      fileName: "diagnostics.json",
      text: "{}",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});
