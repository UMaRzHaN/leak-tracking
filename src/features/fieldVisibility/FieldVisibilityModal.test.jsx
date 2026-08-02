import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FieldVisibilityModal from "./FieldVisibilityModal";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key, options) =>
      ({
        "fieldVisibility.title": "Visible fields",
        "fieldVisibility.active": "active",
        "fieldVisibility.searchPlaceholder": "Search fields",
        "fieldVisibility.notFound": "Nothing found",
        "fieldVisibility.excelOnly": "Excel only",
        "fieldVisibility.hidden": "hidden",
        "fieldVisibility.required": "required",
        "fieldVisibility.showAll": "Show all",
        "fieldVisibility.hideAll": "Hide all",
        "fieldVisibility.hideOthers": "Hide others",
        "fieldVisibility.systemNote": "System fields cannot be hidden",
        "fieldVisibility.cancel": "Cancel",
        "fieldVisibility.save": "Save",
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}));

const config = {
  export: {
    excel: {
      headers: ["Status", "Component", "Note"],
      keysOrder: ["status", "component", "note"],
    },
  },
  steps: {
    steps: [
      {
        title: "Основное",
        fields: [
          { key: "status", label: "Status", required: true },
          { key: "component", label: "Component", required: true },
        ],
      },
    ],
  },
};

describe("FieldVisibilityModal", () => {
  it("never exposes protected system fields and saves configurable changes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <FieldVisibilityModal
        open
        onClose={onClose}
        config={config}
        hiddenFields={new Set(["status"])}
        onSave={onSave}
      />,
    );

    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    await user.click(screen.getByText("Component"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toBeInstanceOf(Set);
    expect(saved.has("component")).toBe(true);
    expect(saved.has("status")).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters fields by label and key", async () => {
    const user = userEvent.setup();
    render(
      <FieldVisibilityModal
        open
        onClose={vi.fn()}
        config={config}
        hiddenFields={new Set()}
        onSave={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search fields"), "note");
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByText("Component")).not.toBeInTheDocument();
  });
});
