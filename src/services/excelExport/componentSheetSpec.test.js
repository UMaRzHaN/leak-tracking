import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasRegistry: vi.fn(),
  loadRegistry: vi.fn(),
  loadComponents: vi.fn(),
}));

vi.mock("@/configs/componentRegistry.config", () => ({
  hasComponentRegistry: mocks.hasRegistry,
}));
vi.mock("@/configs/projectAdapter", () => ({
  loadComponentRegistry: mocks.loadRegistry,
}));
vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.loadComponents },
}));

const { buildComponentSheetSpec } = await import("./componentSheetSpec");
const { HIDDEN_FIELD_SCOPES, hiddenFieldsStorageKey } =
  await import("@/app/project/hiddenFieldsStorage");

const project = { id: "p1", type: "upstream" };
const registry = {
  excel: {
    sheet: "Inventorization",
    headers: ["№", "Индивидуальный номер компонента"],
    keysOrder: ["index", "component_uid"],
  },
  fields: { all: [{ key: "component_uid", label: "Номер" }] },
};

describe("buildComponentSheetSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.hasRegistry.mockReturnValue(true);
    mocks.loadRegistry.mockResolvedValue(registry);
    mocks.loadComponents.mockResolvedValue([
      { id: "c2", component_uid: "4243" },
      { id: "c1", component_uid: "4242" },
    ]);
  });

  it("не выгружает столбец, скрытый в настройках реестра", async () => {
    // Столбец, которого человек не видит в форме, в отчёте только сбивает.
    // Список скрытого читается из хранилища: сюда, в сборку листа, хук не
    // дотянется.
    localStorage.setItem(
      hiddenFieldsStorageKey(project.id, HIDDEN_FIELD_SCOPES.COMPONENTS),
      JSON.stringify(["component_uid"]),
    );

    const spec = await buildComponentSheetSpec(project);

    expect(spec.keysOrder).toEqual(["index"]);
    expect(spec.headers).toEqual(["№"]);
  });

  it("скрытое у утечек столбцов реестра не трогает", async () => {
    localStorage.setItem(
      hiddenFieldsStorageKey(project.id, HIDDEN_FIELD_SCOPES.LEAKS),
      JSON.stringify(["component_uid"]),
    );

    const spec = await buildComponentSheetSpec(project);

    expect(spec.keysOrder).toEqual(["index", "component_uid"]);
  });

  it("orders cards by their identity number, not by storage order", async () => {
    const spec = await buildComponentSheetSpec(project);

    expect(spec.components.map((card) => card.component_uid)).toEqual([
      "4242",
      "4243",
    ]);
    // Ссылка на снимок должна найти картинку той строки, на которой стоит.
    expect(spec.ids).toEqual(["c1", "c2"]);
    expect(spec.name).toBe("Inventorization");
  });

  it("carries the cards themselves, which the history sheet needs", async () => {
    const spec = await buildComponentSheetSpec(project);

    expect(spec.components).toHaveLength(2);
    expect(spec.fields).toEqual(registry.fields.all);
  });

  /*
   * Ниже — намеренное молчание: отсутствующая вкладка лучше, чем упавшая
   * выгрузка, которую человек ждёт. Тесты держат это решение явным, чтобы
   * пропавший из книги реестр не выглядел случайностью.
   */
  it("writes no sheet for a project type that keeps no registry", async () => {
    mocks.hasRegistry.mockReturnValue(false);

    await expect(buildComponentSheetSpec(project)).resolves.toBe(null);
    expect(mocks.loadComponents).not.toHaveBeenCalled();
  });

  it("writes no sheet for a walk that has not started", async () => {
    mocks.loadComponents.mockResolvedValue([]);

    await expect(buildComponentSheetSpec(project)).resolves.toBe(null);
  });

  it("writes no sheet when storage refuses to answer", async () => {
    mocks.loadComponents.mockRejectedValue(new Error("хранилище молчит"));

    await expect(buildComponentSheetSpec(project)).resolves.toBe(null);
  });

  it("writes no sheet without a project", async () => {
    await expect(buildComponentSheetSpec(null)).resolves.toBe(null);
  });
});
