import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ importBundledInventory: vi.fn() }));
vi.mock("@/services/inventory/bundledInventory", () => ({
  importBundledInventory: mocks.importBundledInventory,
}));

const { importInventoryAlongside, withInventoryNote } =
  await import("./bundledInventoryNote");
const { translateRu: t } = await import("@/test/translate");

const result = { bundledInventory: new File(["x"], "inv.zip") };
const project = { id: "p1" };

describe("importInventoryAlongside", () => {
  it("без инвентаризации в архиве ничего не делает", async () => {
    expect(await importInventoryAlongside({}, project, t)).toBe("");
    expect(mocks.importBundledInventory).not.toHaveBeenCalled();
  });

  it("вливает в проект утечек и говорит итог", async () => {
    mocks.importBundledInventory.mockResolvedValue({
      status: "imported",
      added: 2,
      updated: 1,
      conflicts: 0,
    });
    const note = await importInventoryAlongside(result, project, t);
    expect(mocks.importBundledInventory).toHaveBeenCalledWith(
      result.bundledInventory,
      project,
    );
    expect(note).toBe(
      "Инвентаризация: добавлено 2, обновлено 1, совпавших номеров 0.",
    );
    expect(withInventoryNote("Импортировано 5.", note)).toBe(
      "Импортировано 5. Инвентаризация: добавлено 2, обновлено 1, совпавших номеров 0.",
    );
  });

  it("у проекта без реестра — предупреждение, а не тишина", async () => {
    mocks.importBundledInventory.mockResolvedValue({ status: "no-registry" });
    expect(await importInventoryAlongside(result, project, t)).toMatch(
      /реестра компонентов нет/,
    );
  });

  it("сбой инвентаризации не роняет импорт утечек", async () => {
    mocks.importBundledInventory.mockRejectedValue(new Error("диск полон"));
    expect(await importInventoryAlongside(result, project, t)).toMatch(
      /^Ошибка импорта инвентаризации: /,
    );
  });
});
