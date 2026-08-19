import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.load },
}));

const { COMPONENT_REGISTRY_UPDATED, useRegistryLocationSource } =
  await import("./useRegistryLocationSource");

const project = { id: "p1", folderName: "b" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue([{ id: "c1", subdivision: "Мессояхское УПГ" }]);
});

describe("what the header counts folders by", () => {
  it("reads nothing while the registry is not the screen in front of you", () => {
    const { result } = renderHook(() =>
      useRegistryLocationSource(project, false),
    );

    expect(mocks.load).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it("reads the registry once it is", async () => {
    const { result } = renderHook(() =>
      useRegistryLocationSource(project, true),
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it("re-reads when a card is written, not on the next visit", async () => {
    // Иначе только что заведённая карточка не попадала бы в счёт папки, пока
    // человек не уйдёт с экрана и не вернётся.
    renderHook(() => useRegistryLocationSource(project, true));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new CustomEvent(COMPONENT_REGISTRY_UPDATED));
    });

    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  });

  it("shows an empty tree rather than failing the header", async () => {
    mocks.load.mockRejectedValue(new Error("storage is gone"));
    const { result } = renderHook(() =>
      useRegistryLocationSource(project, true),
    );

    await waitFor(() => expect(mocks.load).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
