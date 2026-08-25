import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  activeProject: null,
}));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.load, save: mocks.save },
}));

// Провайдер спрашивает активный проект у ProjectContext. Поднимать весь
// контекст ради этого нечего: тесту нужен один ответ на один вопрос.
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: mocks.activeProject }),
}));

const { useComponentRegistry } = await import("./useComponentRegistry");
const { ComponentRegistryProvider } =
  await import("./ComponentRegistryContext");

const upstream = { id: "p1", type: "upstream", folderName: "buzahur" };
const midstream = { id: "p2", type: "midstream", folderName: "umg" };

/**
 * Хук проверяется вместе с провайдером, а не вместо него: список и очередь
 * записи живут там, и подменённый список проверил бы совсем не то.
 */
function render(project) {
  mocks.activeProject = project;
  return renderHook(() => useComponentRegistry(project), {
    wrapper: ComponentRegistryProvider,
  });
}

describe("useComponentRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeProject = null;
    mocks.load.mockResolvedValue([]);
    mocks.save.mockImplementation(async (_project, list) =>
      list.map((item, index) => ({ id: item.id ?? `id${index}`, ...item })),
    );
  });

  it("stays off for a project type without a declared registry", async () => {
    const { result } = render(midstream);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("loads the registry for a project that has one", async () => {
    mocks.load.mockResolvedValue([{ id: "a", component_uid: "2" }]);
    const { result } = render(upstream);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(true);
    expect(result.current.components).toHaveLength(1);
  });

  it("sorts numerically so 9 comes before 10", async () => {
    mocks.load.mockResolvedValue([
      { id: "a", component_uid: "10" },
      { id: "b", component_uid: "9" },
    ]);
    const { result } = render(upstream);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.components.map((c) => c.component_uid)).toEqual([
      "9",
      "10",
    ]);
  });

  it("surfaces a load failure instead of showing an empty registry", async () => {
    mocks.load.mockRejectedValue(new Error("boom"));
    const { result } = render(upstream);

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.components).toEqual([]);
  });

  it("appends a card and passes the declared numeric keys along", async () => {
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addComponent({
        component_uid: "1",
        component_name: "Задвижка",
      });
    });

    const [, list, options] = mocks.save.mock.calls[0];
    expect(list).toHaveLength(1);
    expect(options.numericKeys).toContain("nominal_diameter");
  });

  it("does not drop a card when two are saved back to back", async () => {
    // A walk saves cards in quick succession; a whole-list replace would race.
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await Promise.all([
        result.current.addComponent({ component_uid: "1" }),
        result.current.addComponent({ component_uid: "2" }),
      ]);
    });

    expect(result.current.components).toHaveLength(2);
  });

  it("keeps saving after one write fails", async () => {
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    mocks.save.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      await result.current.addComponent({ component_uid: "1" }).catch(() => {});
    });

    await act(async () => {
      await result.current.addComponent({ component_uid: "2" });
    });
    expect(result.current.components).toHaveLength(1);
  });

  it("edits a card in place rather than forking it", async () => {
    mocks.load.mockResolvedValue([{ id: "a", component_uid: "3" }]);
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateComponent("a", { manufacturer: "Завод" });
    });

    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].manufacturer).toBe("Завод");
  });

  it("removes a card", async () => {
    mocks.load.mockResolvedValue([
      { id: "a", component_uid: "1" },
      { id: "b", component_uid: "2" },
    ]);
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeComponent("a");
    });
    expect(result.current.components.map((c) => c.id)).toEqual(["b"]);
  });

  it("reports a duplicate number without refusing it", async () => {
    mocks.load.mockResolvedValue([{ id: "a", component_uid: "7" }]);
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.findConflicts("7")).toHaveLength(1);
    expect(result.current.findConflicts("7", "a")).toHaveLength(0);
    expect(result.current.findConflicts("8")).toHaveLength(0);
  });
  it("удаление кладёт запись об удалении, а не стирает карточку", async () => {
    // Стёртая запись не переживает обмена: соседний телефон вернул бы карточку
    // молча, потому что для него она просто есть.
    mocks.load.mockResolvedValue([
      { id: "a", component_uid: "1" },
      { id: "b", component_uid: "2" },
    ]);
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeComponent("a");
    });

    // Наружу — только карточки.
    expect(result.current.components.map((c) => c.id)).toEqual(["b"]);
    // В хранилище — обе записи, одна из них с пометкой об удалении.
    const [, written] = mocks.save.mock.calls[0];
    expect(written).toHaveLength(2);
    expect(written.find((record) => record.id === "a")).toMatchObject({
      deleted: true,
      deletedAt: expect.any(Number),
    });
  });

  it("не показывает и не считает удалённые карточки", async () => {
    mocks.load.mockResolvedValue([
      { id: "a", component_uid: "7", deleted: true, deletedAt: 5_000 },
      { id: "b", component_uid: "7" },
    ]);
    const { result } = render(upstream);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.components.map((c) => c.id)).toEqual(["b"]);
    // Номер удалённой карточки свободен: спорить не с чем.
    expect(result.current.conflicts).toEqual([]);
    expect(result.current.findConflicts("7")).toHaveLength(1);
  });
});
