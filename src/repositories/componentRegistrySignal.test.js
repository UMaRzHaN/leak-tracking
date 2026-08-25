import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPONENT_REGISTRY_UPDATED,
  notifyComponentRegistryChanged,
  onComponentRegistryChanged,
} from "./componentRegistrySignal";

describe("сигнал об изменении реестра", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("доносит сообщение до подписчика и отписывает его", () => {
    const listener = vi.fn();
    const unsubscribe = onComponentRegistryChanged(listener);

    notifyComponentRegistryChanged();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifyComponentRegistryChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("называется так же, как событие, которое слушают снаружи", () => {
    const listener = vi.fn();
    window.addEventListener(COMPONENT_REGISTRY_UPDATED, listener);
    notifyComponentRegistryChanged();
    window.removeEventListener(COMPONENT_REGISTRY_UPDATED, listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("молчит там, где окна нет вовсе", () => {
    // Тот же код исполняется в воркере экспорта, где ни окна, ни экрана нет, и
    // падать из-за отсутствующего слушателя ему незачем.
    vi.stubGlobal("window", undefined);

    expect(() => notifyComponentRegistryChanged()).not.toThrow();
    expect(() => onComponentRegistryChanged(vi.fn())()).not.toThrow();
  });
});
