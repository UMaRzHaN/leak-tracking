import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import VoicePreviewSheet from "./VoicePreviewSheet";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (_key, options) => options?.defaultValue ?? _key,
  }),
}));

const steps = [
  {
    fields: [
      { key: "object", label: "Object" },
      { key: "component", label: "Component" },
    ],
  },
];

describe("VoicePreviewSheet", () => {
  it("confirms only selected voice fields", () => {
    const onConfirm = vi.fn();

    render(
      <VoicePreviewSheet
        pending={{ object: "Valve", component: "Flange" }}
        steps={steps}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: /Recognized by voice/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Component Flange/ }));
    fireEvent.click(screen.getByRole("button", { name: /Apply \(1\)/ }));

    expect(onConfirm).toHaveBeenCalledWith({ object: "Valve" });
  });

  it("renders empty recognition state without applying data", () => {
    const onConfirm = vi.fn();

    render(
      <VoicePreviewSheet
        pending={{}}
        steps={steps}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Nothing was recognized")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Apply \(0\)/ }).disabled).toBe(
      true,
    );
  });
});
