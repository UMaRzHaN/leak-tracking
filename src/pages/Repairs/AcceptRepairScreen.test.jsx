import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const photoMocks = vi.hoisted(() => ({ savePhoto: vi.fn() }));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ savePhoto: photoMocks.savePhoto }),
}));
vi.mock("@/features/coords/GpsCoordsUpdate", () => ({ default: () => null }));
vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange({ raw: new Blob(["x"]), src: "preview" })}
    >
      Add photo
    </button>
  ),
}));

const AcceptRepairScreen = (await import("./AcceptRepairScreen")).default;

describe("AcceptRepairScreen", () => {
  it("показывает ошибку, если снимок не лёг в хранилище", async () => {
    photoMocks.savePhoto.mockRejectedValue(new Error("disk full"));
    const onSave = vi.fn();
    render(
      <AcceptRepairScreen
        leak={{ id: "l1", leak_id: "L-1", status: "in_progress" }}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Add photo"));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept and close repair" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(onSave).not.toHaveBeenCalled();
  });
});
