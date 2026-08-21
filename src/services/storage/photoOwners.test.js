import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: repository,
}));

const { collectPhotoOwners } = await import("./photoOwners");

const project = { id: "p1", folderName: "buzahur" };

describe("collectPhotoOwners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.load.mockResolvedValue([]);
  });

  it("counts component cards as photo owners alongside leaks", async () => {
    repository.load.mockResolvedValue([{ id: "c1", photo: "idb://card" }]);

    await expect(
      collectPhotoOwners(project, [{ id: "l1", photo: "idb://leak" }]),
    ).resolves.toEqual([
      { id: "l1", photo: "idb://leak" },
      { id: "c1", photo: "idb://card" },
    ]);
  });

  it("refuses to answer when the registry cannot be read", async () => {
    // Молчание реестра — не доказательство, что на его снимки никто не
    // ссылается; уборка по такому списку стёрла бы их все.
    repository.load.mockRejectedValue(new Error("реестр не читается"));

    await expect(collectPhotoOwners(project, [{ id: "l1" }])).resolves.toBe(
      null,
    );
  });

  it("refuses when the registry answers with something that is not a list", async () => {
    repository.load.mockResolvedValue(null);

    await expect(collectPhotoOwners(project, [])).resolves.toBe(null);
  });

  it("returns the leaks unchanged when there is no project to ask about", async () => {
    const leaks = [{ id: "l1" }];
    await expect(collectPhotoOwners(null, leaks)).resolves.toEqual(leaks);
    expect(repository.load).not.toHaveBeenCalled();
  });
});
