import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: ({ onChange, required, error }) => (
    <button
      type="button"
      data-testid="photo-input"
      data-required={String(required)}
      data-error={String(error)}
      onClick={() => onChange({ raw: new Blob(["photo"]), src: "preview" })}
    >
      Add photo
    </button>
  ),
}));

import MonitoringSheet from "./MonitoringSheet";

const texts = {
  check: "Check leak",
  leakNumber: "Tag",
  close: "Close",
  result: "Result",
  currentState: "current",
  comment: "Comment",
  commentPlaceholder: "Add comment",
  materials: "Materials",
  materialsPlaceholder: "Add materials",
  photo: "Photo",
  saving: "Saving...",
  save: "Save",
};

function renderSheet(overrides = {}) {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <MonitoringSheet
      leak={{ id: "l1", leak_id: "TAG-7", status: "open" }}
      draft={{
        result: "still_leaking",
        comment: "",
        materials_equipment: "",
        photo: null,
      }}
      texts={texts}
      lang="en"
      progress={{ current: 2, total: 4 }}
      submitted={false}
      saving={false}
      photoRequired={false}
      onChange={onChange}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...view, onChange, onSave, onClose };
}

describe("MonitoringSheet", () => {
  it("renders progress and marks the leak's current state", () => {
    renderSheet();

    expect(screen.getByText("2 / 4")).toBeTruthy();
    expect(screen.getByText(/TAG-7/)).toBeTruthy();
    expect(screen.getByRole("option", { name: "Yes (current)" })).toBeTruthy();
  });

  it("emits patches for result, comment, materials, and photo", () => {
    const { onChange } = renderSheet();

    fireEvent.change(screen.getByLabelText("Result"), {
      target: { value: "resolved" },
    });
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Fixed" },
    });
    fireEvent.change(screen.getByLabelText("Materials"), {
      target: { value: "New seal" },
    });
    fireEvent.click(screen.getByTestId("photo-input"));

    expect(onChange).toHaveBeenNthCalledWith(1, { result: "resolved" });
    expect(onChange).toHaveBeenNthCalledWith(2, { comment: "Fixed" });
    expect(onChange).toHaveBeenNthCalledWith(3, {
      materials_equipment: "New seal",
    });
    expect(onChange).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        photo: expect.objectContaining({ src: "preview" }),
      }),
    );
  });

  it("shows the required-photo error only after submission", () => {
    const { rerender } = renderSheet({ photoRequired: true, submitted: false });
    expect(screen.getByTestId("photo-input").getAttribute("data-error")).toBe(
      "false",
    );

    rerender(
      <MonitoringSheet
        leak={{ leak_id: "TAG-7", status: "open" }}
        draft={{ result: "still_leaking", comment: "", photo: null }}
        texts={texts}
        lang="en"
        submitted
        saving={false}
        photoRequired
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("photo-input").getAttribute("data-required"),
    ).toBe("true");
    expect(screen.getByTestId("photo-input").getAttribute("data-error")).toBe(
      "true",
    );
  });

  it("blocks closing and saving controls while a save is in progress", () => {
    const { container, onClose, onSave } = renderSheet({ saving: true });

    fireEvent.click(container.firstChild);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Saving..." }));

    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Saving..." }).disabled).toBe(
      true,
    );
  });

  it("closes from the overlay but not from clicks inside the sheet", () => {
    const { container, onClose } = renderSheet();

    fireEvent.click(screen.getByText("Check leak"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
