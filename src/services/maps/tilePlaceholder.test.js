import { beforeEach, describe, expect, it, vi } from "vitest";

const hash = vi.hoisted(() => ({ fingerprintBlob: vi.fn() }));
vi.mock("@/utils/blobHash", () => hash);

const { isPlaceholderTile } = await import("./tilePlaceholder");

const PLACEHOLDER_SHA256 =
  "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";

describe("заглушка Esri", () => {
  beforeEach(() => vi.clearAllMocks());

  it("пропускает тайл другого размера, не считая хеш", async () => {
    expect(await isPlaceholderTile(new Blob(["real tile"]))).toBe(false);
    expect(hash.fingerprintBlob).not.toHaveBeenCalled();
  });

  it("узнаёт заглушку по размеру и отпечатку", async () => {
    hash.fingerprintBlob.mockResolvedValue(PLACEHOLDER_SHA256);

    expect(await isPlaceholderTile(new Blob([new Uint8Array(2521)]))).toBe(
      true,
    );
  });

  it("не путает с заглушкой настоящий тайл того же размера", async () => {
    // Однотонная степь или вода сжимаются в JPEG почти до такого же объёма.
    hash.fingerprintBlob.mockResolvedValue("0".repeat(64));

    expect(await isPlaceholderTile(new Blob([new Uint8Array(2521)]))).toBe(
      false,
    );
  });
});
