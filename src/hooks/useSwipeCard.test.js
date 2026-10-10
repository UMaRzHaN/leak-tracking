import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipeCard } from "./useSwipeCard";

const leak = { id: "leak-1" };

/** Мышью от x=200 до `toX`: тот же путь, что пальцем, но без TouchEvent. */
function drag(result, toX, { release = true } = {}) {
  act(() => result.current.handlers.onMouseDown({ clientX: 200, clientY: 0 }));
  act(() => result.current.handlers.onMouseMove({ clientX: toX, clientY: 0 }));
  if (release) {
    act(() => result.current.handlers.onMouseUp({ clientX: toX, clientY: 0 }));
  }
}

describe("useSwipeCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("свайп влево ведёт в проверку, когда она есть", () => {
    const onMonitor = vi.fn();
    const { result } = renderHook(() => useSwipeCard({ leak, onMonitor }));

    drag(result, 50);
    act(() => vi.runAllTimers());

    expect(onMonitor).toHaveBeenCalledWith(leak);
  });

  it("без проверки свайп влево ничего не делает и карточку не сдвигает", () => {
    const onOpenDetails = vi.fn();
    const { result } = renderHook(() => useSwipeCard({ leak, onOpenDetails }));

    drag(result, 50, { release: false });
    expect(result.current.swipeOffset).toBe(0);

    act(() => result.current.handlers.onMouseUp({ clientX: 50, clientY: 0 }));
    act(() => vi.runAllTimers());
    expect(result.current.swipeState).toBeNull();
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("свайп вправо открывает карточку и без проверки", () => {
    const onOpenDetails = vi.fn();
    const { result } = renderHook(() => useSwipeCard({ leak, onOpenDetails }));

    drag(result, 350, { release: false });
    expect(result.current.swipeOffset).toBe(150);

    act(() => result.current.handlers.onMouseUp({ clientX: 350, clientY: 0 }));
    act(() => vi.runAllTimers());
    expect(onOpenDetails).toHaveBeenCalledWith(leak);
  });
});
