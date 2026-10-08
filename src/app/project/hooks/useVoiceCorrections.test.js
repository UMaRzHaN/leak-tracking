import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useVoiceCorrections } from "./useVoiceCorrections";

describe("useVoiceCorrections", () => {
  beforeEach(() => localStorage.clear());

  it("доносит правку с экрана настроек до формы утечки без перезапуска", () => {
    const settingsScreen = renderHook(() => useVoiceCorrections("project-a"));
    const form = renderHook(() => useVoiceCorrections("project-a"));
    const before = form.result.current.corrections;

    act(() =>
      settingsScreen.result.current.saveCorrections([
        { from: "фланец", to: "фланец ДУ50" },
      ]),
    );

    expect(form.result.current.corrections).not.toBe(before);
    expect(form.result.current.corrections).toHaveLength(1);
    expect(form.result.current.corrections).toEqual(
      settingsScreen.result.current.corrections,
    );
  });
});
