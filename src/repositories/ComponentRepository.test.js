import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  getState: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  save: vi.fn(),
  getStrict: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@/repositories/idb", () => ({
  createIdbStore: () => ({
    open: mocks.open,
    getState: mocks.getState,
    subscribe: mocks.subscribe,
    save: mocks.save,
    getStrict: mocks.getStrict,
    remove: mocks.remove,
  }),
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn() },
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
}));

const { ComponentRepository, ComponentDataError } =
  await import("./ComponentRepository");

const project = { id: "p1", folderName: "buzahur" };

describe("ComponentRepository on web", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockReturnValue({ ready: true });
    mocks.save.mockResolvedValue(true);
    mocks.getStrict.mockResolvedValue(null);
    mocks.remove.mockResolvedValue(true);
  });

  it("reads an empty registry before anyone has walked", async () => {
    await expect(ComponentRepository.load(project)).resolves.toEqual([]);
  });

  it("reads the array out of a stored envelope", async () => {
    mocks.getStrict.mockResolvedValue({
      version: 1,
      updatedAt: 1,
      data: [{ id: "a", component_uid: "1" }],
    });
    const loaded = await ComponentRepository.load(project);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].component_uid).toBe("1");
  });

  it("still reads a bare array left by an older build", async () => {
    // "Empty" is indistinguishable from "walk not started" — misreading a
    // legacy shape would quietly invite somebody to redo a day of work.
    mocks.getStrict.mockResolvedValue([{ id: "a", component_uid: "3" }]);
    await expect(ComponentRepository.load(project)).resolves.toHaveLength(1);
  });

  it("returns nothing for a project that does not exist", async () => {
    await expect(ComponentRepository.load(null)).resolves.toEqual([]);
    expect(mocks.getStrict).not.toHaveBeenCalled();
  });

  it("wraps the list in a versioned envelope on save", async () => {
    await ComponentRepository.save(project, [{ component_uid: "1" }], {
      now: 1_700_000_000_000,
    });

    const [key, envelope] = mocks.save.mock.calls[0];
    expect(key).toBe("p1");
    expect(envelope.version).toBe(1);
    expect(envelope.updatedAt).toBe(1_700_000_000_000);
    expect(envelope.data).toHaveLength(1);
  });

  it("normalizes records on the way in", async () => {
    const stored = await ComponentRepository.save(
      project,
      [{ component_uid: "1", diameter: "426" }],
      { numericKeys: ["diameter"] },
    );

    expect(stored[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(stored[0].diameter).toBe(426);
  });

  it("reports a failed write instead of pretending it saved", async () => {
    mocks.save.mockResolvedValue(false);
    await expect(
      ComponentRepository.save(project, [{ component_uid: "1" }]),
    ).rejects.toMatchObject({ code: "COMPONENT_WRITE_FAILED" });
  });

  it("refuses a payload that is not a list", async () => {
    await expect(
      ComponentRepository.save(project, { component_uid: "1" }),
    ).rejects.toBeInstanceOf(ComponentDataError);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("refuses to save without a project", async () => {
    await expect(ComponentRepository.save(null, [])).rejects.toMatchObject({
      code: "COMPONENT_PROJECT_REQUIRED",
    });
  });

  it("surfaces a read failure rather than reading as empty", async () => {
    // Swallowing this would show an empty registry over a full one.
    mocks.getStrict.mockRejectedValue(new Error("boom"));
    await expect(ComponentRepository.load(project)).rejects.toMatchObject({
      code: "COMPONENT_READ_FAILED",
    });
  });

  it("gives up when the store never becomes ready", async () => {
    vi.useFakeTimers();
    mocks.getState.mockReturnValue({ ready: false });

    const pending = ComponentRepository.load(project).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    const error = await pending;

    expect(error.code).toBe("COMPONENT_STORE_UNAVAILABLE");
    vi.useRealTimers();
  });

  it("deletes a project's registry", async () => {
    await expect(ComponentRepository.remove(project)).resolves.toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith("p1");
  });
});

describe("ComponentRepository on mobile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadNativeRepository(filesystem) {
    vi.doMock("@/utils/platform", () => ({ isNative: true }));
    vi.doMock("@capacitor/filesystem", () => ({
      Filesystem: filesystem,
      Directory: { Data: "DATA" },
      Encoding: { UTF8: "utf8" },
    }));
    return (await import("./ComponentRepository")).ComponentRepository;
  }

  it("keeps the registry in its own file beside the project data", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const repository = await loadNativeRepository({
      writeFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      deleteFile: vi.fn(),
    });

    await repository.save(project, [{ component_uid: "1" }]);

    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "LeakReports/buzahur/data/components.json",
        directory: "DATA",
      }),
    );
  });

  it("treats a missing file as an empty registry", async () => {
    const repository = await loadNativeRepository({
      readFile: vi.fn().mockRejectedValue(
        Object.assign(new Error("File does not exist"), {
          message: "File does not exist",
        }),
      ),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      deleteFile: vi.fn(),
    });

    await expect(repository.load(project)).resolves.toEqual([]);
  });

  it("reads back what it wrote", async () => {
    const repository = await loadNativeRepository({
      readFile: vi.fn().mockResolvedValue({
        data: JSON.stringify({
          version: 1,
          updatedAt: 1,
          data: [{ id: "a", component_uid: "7", component_name: "Задвижка" }],
        }),
      }),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      deleteFile: vi.fn(),
    });

    const loaded = await repository.load(project);
    expect(loaded[0].component_name).toBe("Задвижка");
  });
});
