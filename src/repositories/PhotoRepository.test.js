import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compressImage: vi.fn(async (blob) => blob),
  isWithinPhotoBudget: vi.fn(async () => false),
  getState: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  listKeys: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@/repositories/compressImage", () => ({
  compressImage: mocks.compressImage,
  isWithinPhotoBudget: mocks.isWithinPhotoBudget,
}));
vi.mock("@/repositories/idb", () => ({
  idb: {
    getState: mocks.getState,
    save: mocks.save,
    remove: mocks.remove,
    get: mocks.get,
    listKeys: mocks.listKeys,
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { mkdir: mocks.mkdir },
  Directory: { Data: "DATA" },
}));

const { PhotoRepository, encodeStorageKeyPart } =
  await import("./PhotoRepository");
const { markPhotoPrepared } = await import("@/utils/photoPreparation");

describe("PhotoRepository on web", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockReturnValue({ ready: true });
    mocks.save.mockResolvedValue(true);
    mocks.get.mockResolvedValue(null);
    mocks.remove.mockResolvedValue(true);
    mocks.listKeys.mockResolvedValue([]);
  });

  it("saves a compressed blob and preserves excluded old versions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(500);
    mocks.listKeys.mockResolvedValue([
      "photo_project_leak_100",
      "photo_project_leak_200",
      "photo_project_leak_monitoring_100",
      "photo_other_leak_100",
    ]);
    const blob = new Blob(["photo"], { type: "image/jpeg" });

    const path = await PhotoRepository.save(
      blob,
      { projectId: "project", leakId: "leak" },
      ["idb://photo_project_leak_200"],
    );

    expect(path).toBe("idb://photo_project_leak_500");
    expect(mocks.compressImage).toHaveBeenCalledWith(blob);
    expect(mocks.save).toHaveBeenCalledWith("photo_project_leak_500", blob);
    expect(mocks.remove).toHaveBeenCalledWith("photo_project_leak_100");
    expect(mocks.remove).not.toHaveBeenCalledWith("photo_project_leak_200");
    expect(mocks.remove).not.toHaveBeenCalledWith(
      "photo_project_leak_monitoring_100",
    );
  });

  it("reuses a content-addressed photo before compression", async () => {
    const hash = "a".repeat(64);
    const blob = new Blob(["duplicate"], { type: "image/jpeg" });
    mocks.get.mockResolvedValue(new Blob(["stored"], { type: "image/jpeg" }));

    const path = await PhotoRepository.save(
      blob,
      { projectId: "project", leakId: "duplicate" },
      [],
      { contentHash: hash },
    );

    expect(path).toBe(`idb://photo_project_duplicate_h_${hash}`);
    expect(mocks.get).toHaveBeenCalledWith(`photo_project_duplicate_h_${hash}`);
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not recompress a prepared photo or scan when cleanup is disabled", async () => {
    const blob = markPhotoPrepared(
      new Blob(["prepared"], { type: "image/jpeg" }),
    );

    const path = await PhotoRepository.save(
      blob,
      { projectId: "project", leakId: "new" },
      [],
      { cleanupOldVersions: false },
    );

    expect(path).toMatch(/^idb:\/\/photo_project_new_\d+(?:_\d+)?$/);
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(mocks.listKeys).not.toHaveBeenCalled();
  });

  it("uses distinct storage keys for concurrent saves in one millisecond", async () => {
    vi.spyOn(Date, "now").mockReturnValue(700);
    const blob = markPhotoPrepared(
      new Blob(["prepared"], { type: "image/jpeg" }),
    );

    const [first, second] = await Promise.all([
      PhotoRepository.save(blob, { projectId: "project", leakId: "same" }, [], {
        cleanupOldVersions: false,
      }),
      PhotoRepository.save(blob, { projectId: "project", leakId: "same" }, [], {
        cleanupOldVersions: false,
      }),
    ]);

    expect(first).not.toBe(second);
    expect(mocks.save.mock.calls.map(([key]) => key)).toEqual([
      "photo_project_same_700",
      "photo_project_same_700_1",
    ]);
  });

  it("encodes project and leak ids consistently across save, delete, and GC", async () => {
    vi.spyOn(Date, "now").mockReturnValue(800);
    const projectId = "../tenant_one";
    const leakId = "../../victim\\\0_part";
    const projectPart = encodeStorageKeyPart(projectId);
    const leakPart = encodeStorageKeyPart(leakId);
    const photoKey = `photo_${projectPart}_${leakPart}_800`;
    const orphanKey = `photo_${projectPart}_orphan_700`;
    const blob = markPhotoPrepared(
      new Blob(["prepared"], { type: "image/jpeg" }),
    );

    const path = await PhotoRepository.save(blob, { projectId, leakId }, [], {
      cleanupOldVersions: false,
    });

    expect(path).toBe(`idb://${photoKey}`);
    expect(photoKey).not.toMatch(/[\\/]/);
    expect(photoKey).not.toContain("\0");
    expect(photoKey).not.toContain("..");
    expect(mocks.save).toHaveBeenCalledWith(photoKey, blob);

    await PhotoRepository.delete(path, { projectId });
    expect(mocks.remove).toHaveBeenCalledWith(photoKey);

    mocks.remove.mockClear();
    mocks.listKeys.mockResolvedValue([
      photoKey,
      orphanKey,
      "photo_other_1_100",
    ]);
    await PhotoRepository.gcOrphaned(() => [{ photo: path }], { projectId });
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith(orphanKey);

    mocks.remove.mockClear();
    await PhotoRepository.deleteProjectPhotos(projectId);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith(photoKey);
    expect(mocks.remove).toHaveBeenCalledWith(orphanKey);
  });

  it("allows numeric zero identifiers without producing ambiguous keys", async () => {
    const blob = markPhotoPrepared(new Blob(["prepared"]));

    const path = await PhotoRepository.save(
      blob,
      { projectId: 0, leakId: 0 },
      [],
      { cleanupOldVersions: false },
    );

    expect(path).toMatch(/^idb:\/\/photo_0_0_\d+(?:_\d+)?$/);
  });

  it("rejects invalid or unavailable web storage inputs", async () => {
    expect(
      await PhotoRepository.save(null, {
        projectId: "project",
        leakId: "leak",
      }),
    ).toBeNull();
    expect(
      await PhotoRepository.save("not-a-blob", {
        projectId: "project",
        leakId: "leak",
      }),
    ).toBeNull();

    mocks.getState.mockReturnValue({ ready: false });
    expect(
      await PhotoRepository.save(new Blob(["x"]), {
        projectId: "project",
        leakId: "leak",
      }),
    ).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("delegates get, list and idb deletion only while storage is ready", async () => {
    mocks.get.mockResolvedValue("stored-photo");
    mocks.listKeys.mockResolvedValue(["a", "b"]);

    await expect(PhotoRepository.get("key")).resolves.toBe("stored-photo");
    await expect(PhotoRepository.listKeys()).resolves.toEqual(["a", "b"]);
    await PhotoRepository.delete("idb://photo_project_key", {
      projectId: "project",
    });
    expect(mocks.remove).toHaveBeenCalledWith("photo_project_key");

    await PhotoRepository.delete("idb://photo_other_key", {
      projectId: "project",
    });
    expect(mocks.remove).not.toHaveBeenCalledWith("photo_other_key");

    mocks.getState.mockReturnValue({ ready: false });
    await expect(PhotoRepository.get("key")).resolves.toBeNull();
    await PhotoRepository.delete("idb://photo_project_ignored", {
      projectId: "project",
    });
    expect(mocks.remove).not.toHaveBeenCalledWith("photo_project_ignored");
  });

  it("reports an IndexedDB deletion failure to rollback callers", async () => {
    mocks.remove.mockResolvedValueOnce(false);

    await expect(
      PhotoRepository.delete("idb://photo_project_key", {
        projectId: "project",
      }),
    ).resolves.toBe(false);
  });

  it("rejects bulk deletion when any project photo remains", async () => {
    mocks.listKeys.mockResolvedValue([
      "photo_project_1_100",
      "photo_project_2_200",
    ]);
    mocks.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      PhotoRepository.deleteProjectPhotos("project"),
    ).rejects.toMatchObject({
      code: "PHOTO_DELETE_FAILED",
      failedKeys: ["photo_project_2_200"],
    });
  });

  it("deletes only photos belonging to the requested project", async () => {
    mocks.listKeys.mockResolvedValue([
      "photo_project_1_100",
      "photo_project_2_200",
      "photo_other_1_100",
    ]);

    await PhotoRepository.deleteProjectPhotos("project", "unused-on-web");

    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalledWith("photo_other_1_100");
  });

  it("не сметает снимок, сделанный во время самой уборки", async () => {
    // Гонка, ради которой перевёрнут порядок: карточку реестра фотографируют
    // посреди обхода, а уборка идёт в это же время фоном. Снимок, попавший в
    // это окно, объявлялся сиротой и удалялся.
    mocks.listKeys.mockResolvedValue(["photo_project_old"]);

    await PhotoRepository.gcOrphaned(
      async () => {
        // Пока уборка спрашивает владельцев, кто-то успел сохранить снимок.
        mocks.listKeys.mockResolvedValue([
          "photo_project_old",
          "photo_project_fresh",
        ]);
        return [{ photo: "idb://photo_project_old" }];
      },
      { projectId: "project" },
    );

    // Свежего снимка в списке, составленном до вопроса, не было — и удалить
    // его уборка не может по построению, а не потому, что успела заметить.
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("сметает то, что осиротело, пока она спрашивала", async () => {
    // Обратная сторона того же порядка: ссылки спрашиваются позже списка,
    // поэтому снимок, чей владелец исчез в это окно, уже сирота.
    mocks.listKeys.mockResolvedValue([
      "photo_project_kept",
      "photo_project_dropped",
    ]);

    await PhotoRepository.gcOrphaned(
      async () => [{ photo: "idb://photo_project_kept" }],
      {
        projectId: "project",
      },
    );

    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith("photo_project_dropped");
  });

  it("не убирает ничего, когда о владельцах не смогли ответить", async () => {
    // Молчание реестра — не то же самое, что отсутствие ссылок.
    mocks.listKeys.mockResolvedValue(["photo_project_orphan"]);

    await PhotoRepository.gcOrphaned(async () => null, {
      projectId: "project",
    });

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("требует сборщика, а не готовый список", async () => {
    // Готовый список означал бы, что владельцев собрали раньше уборки, — то
    // есть ровно ту гонку, от которой здесь и уходят.
    await expect(
      PhotoRepository.gcOrphaned([{ photo: "idb://x" }], {
        projectId: "project",
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("garbage-collects orphaned photos but keeps all supported references", async () => {
    mocks.listKeys.mockResolvedValue([
      "photo_project_original",
      "photo_project_after",
      "photo_project_repair",
      "photo_project_monitoring",
      "photo_project_monitoring_before",
      "photo_project_orphan",
      "photo_other_orphan",
    ]);
    const leaks = [
      {
        photo: "idb://photo_project_original",
        photo_after: "idb://photo_project_after",
        photo_repair: "idb://photo_project_repair",
        monitoringRecords: [
          {
            photo: "idb://photo_project_monitoring",
            previousPhoto: "idb://photo_project_monitoring_before",
          },
          null,
        ],
      },
    ];

    await PhotoRepository.gcOrphaned(() => leaks, { projectId: "project" });

    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith("photo_project_orphan");
  });
});
