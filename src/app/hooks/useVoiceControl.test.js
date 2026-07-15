import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVoiceControl } from "./useVoiceControl";

let speechResultHandler;

vi.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: (onResult) => {
    speechResultHandler = onResult;
    return {
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({
    voice: {
      outputFields: ["leak_description"],
      synonymsFields: [],
    },
  }),
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({
    project: "upstream",
  }),
}));

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
  }),
}));

describe("useVoiceControl", () => {
  beforeEach(() => {
    speechResultHandler = null;
  });

  it("turns speech results into filtered pending voice data", () => {
    const { result } = renderHook(() => useVoiceControl());

    act(() => {
      speechResultHandler("leak cause corrosion leak description small leak");
    });

    expect(result.current.pendingVoiceData).toEqual({
      leak_description: "Small Leak",
    });
  });

  it("routes short voice commands without opening preview data", () => {
    const onCommand = vi.fn();
    const { result } = renderHook(() => useVoiceControl({ onCommand }));

    act(() => {
      speechResultHandler("next");
    });

    expect(onCommand).toHaveBeenCalledWith("next");
    expect(result.current.pendingVoiceData).toBeNull();
  });
});
