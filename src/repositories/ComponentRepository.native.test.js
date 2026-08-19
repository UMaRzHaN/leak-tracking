import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));
vi.mock("@/repositories/nativeComponentStorage", () => ({
  loadNativeComponents: mocks.load,
  saveNativeComponents: mocks.save,
  deleteNativeComponents: mocks.remove,
  unwrapEnvelope: (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
}));
vi.mock("@/repositories/idb", () => ({
  createIdbStore: () => ({
    open: vi.fn(),
    getState: () => ({ ready: false }),
    subscribe: vi.fn(() => () => {}),
    save: vi.fn(),
    getStrict: vi.fn(),
    remove: vi.fn(),
  }),
}));

const { ComponentRepository } = await import("./ComponentRepository");

const project = { id: "p1", folderName: "buzahur" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue([]);
  mocks.save.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(true);
});

describe("ComponentRepository on a device", () => {
  it("reads the registry out of the store, by folder", async () => {
    mocks.load.mockResolvedValue([{ id: "a", component_uid: "1" }]);

    await expect(ComponentRepository.load(project)).resolves.toHaveLength(1);
    expect(mocks.load).toHaveBeenCalledWith("buzahur");
  });

  it("hands the store what it believes is already there", async () => {
    // Без этого одна исправленная карточка переписывала бы весь обход.
    const previous = [{ id: "a", component_uid: "1" }];

    await ComponentRepository.save(project, previous, { previous });

    expect(mocks.save.mock.calls[0][2]).toMatchObject({ previous });
  });

  it("normalizes on the way in, as it does on the web", async () => {
    await ComponentRepository.save(project, [{ component_uid: " 7 " }]);

    const [, stored] = mocks.save.mock.calls[0];
    expect(stored[0].component_uid).toBe("7");
    expect(stored[0].id).toBeTruthy();
  });

  it("reports a failed write instead of pretending it saved", async () => {
    mocks.save.mockRejectedValue(new Error("no room on device"));

    await expect(
      ComponentRepository.save(project, [{ id: "a" }]),
    ).rejects.toMatchObject({ code: "COMPONENT_WRITE_FAILED" });
  });

  it("drops the registry with the project", async () => {
    await expect(ComponentRepository.remove(project)).resolves.toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith("buzahur");
  });
});
