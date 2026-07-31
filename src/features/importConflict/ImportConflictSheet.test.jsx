import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportConflictSheet from "./ImportConflictSheet";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key, options) => options?.defaultValue ?? key,
  }),
}));

describe("ImportConflictSheet async actions", () => {
  it("allows only one import action and blocks closing while it is pending", async () => {
    let finish;
    const onMerge = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(
      <ImportConflictSheet
        open
        projectName="Project A"
        existingProject={{ leakCount: 2 }}
        leakCount={3}
        onOverwrite={vi.fn()}
        onMerge={onMerge}
        onCopy={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    expect(onMerge).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Merge" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      finish();
    });

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Merge" }).disabled).toBe(false);
  });
});
