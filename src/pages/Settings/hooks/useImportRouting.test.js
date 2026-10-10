import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ importInventoryFile: vi.fn() }));

vi.mock("@/services/inventory/inventoryImport", () => ({
  importInventoryFile: mocks.importInventoryFile,
}));
vi.mock("@/configs/componentRegistry.config", () => ({
  hasComponentRegistry: () => true,
  componentRegistryProjectTypes: () => [],
}));
vi.mock("@/configs/projectAdapter", () => ({
  loadComponentRegistry: async () => ({ excel: {} }),
}));

const { useImportRouting } = await import("./useImportRouting");

describe("итог импорта инвентаризации", () => {
  beforeEach(() => vi.clearAllMocks());

  it("архив только с удалениями и чертежами — не «пустой файл»", async () => {
    mocks.importInventoryFile.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 1,
      conflicts: 0,
      schemas: 2,
    });
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useImportRouting({
        activeProject: { id: "p1", type: "upstream" },
        notify,
        t: (key) => key,
      }),
    );

    await act(() =>
      result.current.handleImportInventory(new File([""], "a.zip")),
    );

    expect(notify).toHaveBeenLastCalledWith(
      "success",
      "settings.inventoryImportedRemovedAndSchemas",
    );
  });
});
