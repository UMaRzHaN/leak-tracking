import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { componentRegistryWrapper } from "@/test/componentRegistry";
import { useRegistryLocationSource } from "./useRegistryLocationSource";

const cards = [{ id: "c1", subdivision: "Мессояхское УПГ" }];

describe("what the header counts folders by", () => {
  it("counts nothing while the registry is not the screen in front of you", () => {
    const requested = [];
    const { result } = renderHook(() => useRegistryLocationSource(false), {
      wrapper: componentRegistryWrapper({
        components: cards,
        requestLoad: () => requested.push(true),
      }),
    });

    // Дерево папок у утечек и у железа разное: подставить одно вместо другого
    // хуже, чем не показать ничего.
    expect(result.current).toEqual([]);
    // И реестр ради этого не читается вовсе.
    expect(requested).toEqual([]);
  });

  it("counts the registry once it is", () => {
    const requested = [];
    const { result } = renderHook(() => useRegistryLocationSource(true), {
      wrapper: componentRegistryWrapper({
        components: cards,
        requestLoad: () => requested.push(true),
      }),
    });

    expect(result.current).toEqual(cards);
    expect(requested.length).toBeGreaterThan(0);
  });

  it("shows an empty tree rather than failing the header", () => {
    const { result } = renderHook(() => useRegistryLocationSource(true), {
      wrapper: componentRegistryWrapper({
        components: [],
        error: new Error("storage is gone"),
      }),
    });

    expect(result.current).toEqual([]);
  });
});
