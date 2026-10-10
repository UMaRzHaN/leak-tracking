import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComponentCheckScreen from "./ComponentCheckScreen";
import { applyComponentCheck } from "./useComponentCheck";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/currentPosition", () => ({ useCurrentPosition: () => null }));
vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: ({ onChange, error }) => (
    <button
      type="button"
      data-error={error ? "true" : "false"}
      onClick={() => onChange({ raw: new Blob(["x"]), src: "preview" })}
    >
      Add photo
    </button>
  ),
}));

const component = {
  id: "c1",
  component_uid: "0002",
  component: "Вентиль",
  component_status: "В резерве",
};

describe("ComponentCheckScreen", () => {
  it("does not save without a photo when the project requires one", () => {
    const onSave = vi.fn();
    render(
      <ComponentCheckScreen
        component={component}
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save inspection" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Add photo" }).dataset.error,
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Течи нет" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save inspection" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      status: "В резерве",
      comment: "Течи нет",
    });
  });

  it("saves without a photo when the setting is off", () => {
    const onSave = vi.fn();
    render(
      <ComponentCheckScreen
        component={component}
        photoRequired={false}
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Требует замены" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save inspection" }));
    expect(onSave.mock.calls[0][0].status).toBe("Требует замены");
  });
});

describe("applyComponentCheck", () => {
  it("puts the photo, comment, point and round into the inspection", async () => {
    const savePhoto = vi.fn(async () => "idb://photo_check");
    const card = await applyComponentCheck(
      { id: "c1", component_status: "В работе", lat: 1, lng: 2 },
      {
        status: "Требует замены",
        comment: " Течь по фланцу ",
        photo: { raw: new Blob(["x"]) },
        coords: { lat: 38.5, lng: 66.2, accuracy: 6.4 },
      },
      { savePhoto, user: "Азиз", roundNumber: 3 },
    );

    expect(savePhoto.mock.calls[0][1]).toBe("c1_inspection");
    expect(card).toMatchObject({
      component_status: "Требует замены",
      lat: 38.5,
      lng: 66.2,
      coords_accuracy: 6,
    });
    const entry = card.history.at(-1);
    expect(entry).toMatchObject({
      action: "component_inspected",
      photo: "idb://photo_check",
      comment: "Течь по фланцу",
      roundNumber: 3,
    });
    expect(entry.changes.map((change) => change.key)).toEqual([
      "component_status",
      "lat",
      "lng",
    ]);
  });

  it("refuses to record an inspection whose photo was not stored", async () => {
    await expect(
      applyComponentCheck(
        { id: "c1" },
        { status: "В работе", photo: { raw: new Blob(["x"]) } },
        { savePhoto: vi.fn(async () => null), user: "Азиз" },
      ),
    ).rejects.toThrow("Photo storage refused the write");
    await waitFor(() => true);
  });
});
