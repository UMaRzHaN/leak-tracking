import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: { save: mocks.save },
}));
vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn(),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

const { buildComponentPhotoArchive, restoreComponentPhotos } =
  await import("./componentPhotoArchive");
const { getJSZip } = await import("./runtime");

const project = { id: "p1", folderName: "buzahur" };
const pixel = () =>
  new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue("idb://photo_restored");
});

describe("carrying component photographs out", () => {
  it("files a picture under the number written on the equipment", async () => {
    const idbGet = vi.fn(async () => pixel());

    const { components, entries } = await buildComponentPhotoArchive(
      [{ id: "a", component_uid: "4242", photo: "idb://photo_a" }],
      idbGet,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("component_photos/4242.jpg");
    expect(components[0].photo).toBe("zip:component_photos/4242.jpg");
  });

  it("keeps two cards with the same number apart", async () => {
    const idbGet = vi.fn(async () => pixel());

    const { entries } = await buildComponentPhotoArchive(
      [
        { id: "a", component_uid: "7", photo: "idb://photo_a" },
        { id: "b", component_uid: "7", photo: "idb://photo_b" },
      ],
      idbGet,
    );

    expect(new Set(entries.map((entry) => entry.path)).size).toBe(2);
  });

  it("drops the key rather than carrying a path that means nothing", async () => {
    // A card whose photo cannot be read must not travel with an idb:// path:
    // on another device it resolves to an empty frame and nothing says why.
    const { components, entries } = await buildComponentPhotoArchive(
      [{ id: "a", component_uid: "1", photo: "idb://missing" }],
      async () => null,
    );

    expect(entries).toHaveLength(0);
    expect(components[0]).not.toHaveProperty("photo");
  });
});

describe("bringing component photographs back", () => {
  it("writes the bytes into this device's storage and repoints the card", async () => {
    const JSZip = (await getJSZip()).default;
    const zip = new JSZip();
    zip.file("component_photos/4242.jpg", pixel());
    const reopened = await new JSZip().loadAsync(
      await zip.generateAsync({ type: "blob" }),
    );

    const restored = await restoreComponentPhotos(
      reopened,
      [{ id: "a", photo: "zip:component_photos/4242.jpg" }],
      project,
    );

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(restored[0].photo).toBe("idb://photo_restored");
    // Отпечаток снимка: имя файла становится содержимым, и повторный импорт
    // того же архива попадает в уже лежащий файл вместо его двойника.
    expect(mocks.save.mock.calls[0][3]).toMatchObject({
      cleanupOldVersions: false,
      contentHash: expect.stringMatching(/^[a-f0-9]{24,64}$/),
    });
  });

  it("still stores the picture when its fingerprint cannot be taken", async () => {
    const JSZip = (await getJSZip()).default;
    const zip = new JSZip();
    zip.file("component_photos/4242.jpg", pixel());
    const reopened = await new JSZip().loadAsync(
      await zip.generateAsync({ type: "blob" }),
    );
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      subtle: {
        digest: () => Promise.reject(new Error("no digest here")),
      },
    });

    try {
      const restored = await restoreComponentPhotos(
        reopened,
        [{ id: "a", photo: "zip:component_photos/4242.jpg" }],
        project,
      );
      // Хеш — способ не писать дубль, а не условие сохранения: без него
      // снимок всё равно должен лечь на диск.
      expect(restored[0].photo).toBe("idb://photo_restored");
      expect(mocks.save).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("crypto", crypto);
    }
  });

  it("leaves a card alone when the archive never carried its picture", async () => {
    const JSZip = (await getJSZip()).default;
    const reopened = await new JSZip().loadAsync(
      await new JSZip().generateAsync({ type: "blob" }),
    );

    const restored = await restoreComponentPhotos(
      reopened,
      [{ id: "a", photo: "zip:component_photos/gone.jpg" }],
      project,
    );

    expect(mocks.save).not.toHaveBeenCalled();
    expect(restored[0].photo).toBe("zip:component_photos/gone.jpg");
  });
});
