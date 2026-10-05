import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "p1" } }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({
    savePhoto: vi.fn(async () => "photos/after.jpg"),
    deletePhoto: vi.fn(),
  }),
}));
vi.mock("@/features/leakList/LeakCardCompact/LeakCardCompact", () => ({
  default: ({ leak, badge }) => (
    <div>
      {leak.leak_id} {badge?.label}
    </div>
  ),
}));
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

const RepairRound = (await import("./RepairRound")).default;

const started = {
  id: "s",
  type: "repair_started",
  date: "2026-10-01T08:00:00Z",
};
const repair = (id, extra = {}) => ({
  id,
  leak_id: id.toUpperCase(),
  status: "in_progress",
  events: [started],
  ...extra,
});

function renderRound(data) {
  const setData = vi.fn(async () => {});
  render(
    <RepairRound
      data={data}
      setData={setData}
      userProfile={{ name: "Ivan" }}
    />,
  );
  return setData;
}

describe("RepairRound", () => {
  it("marks a repair's stage with the crew", async () => {
    const setData = renderRound([repair("r1"), { id: "o", status: "open" }]);

    expect(screen.getByRole("button", { name: "To accept 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark" }));
    fireEvent.click(
      await screen.findByRole("radio", { name: "Ready for check" }),
    );
    fireEvent.change(screen.getByLabelText("Crew"), {
      target: { value: "Crew 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save mark" }));

    await waitFor(() => expect(setData).toHaveBeenCalled());
    const [saved, untouched] = setData.mock.calls[0][0];
    expect(saved.events[saved.events.length - 1]).toMatchObject({
      type: "repair_stage",
      stage: "ready",
      brigade: "Crew 2",
      user: "Ivan",
    });
    expect(untouched).toEqual({ id: "o", status: "open" });
  });

  it("accepts a finished repair with a photo and closes it", async () => {
    const ready = repair("r2", {
      events: [
        started,
        {
          id: "m",
          type: "repair_stage",
          stage: "ready",
          date: "2026-10-02T08:00:00Z",
        },
      ],
    });
    const setData = renderRound([ready]);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Customer" }));
    fireEvent.change(screen.getByLabelText("Material name"), {
      target: { value: "Gasket" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept and close repair" }),
    );

    await waitFor(() => expect(setData).toHaveBeenCalled());
    const [closed] = setData.mock.calls[0][0];
    expect(closed.status).toBe("resolved");
    expect(closed.materials_equipment).toBe("Customer: Gasket");
  });

  it("sends a repair back to work when the leak is still there", async () => {
    const ready = repair("r3", {
      events: [
        started,
        {
          id: "m",
          type: "repair_stage",
          stage: "ready",
          date: "2026-10-02T08:00:00Z",
        },
      ],
    });
    const setData = renderRound([ready]);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.change(await screen.findByLabelText("Still leaking?"), {
      target: { value: "yes" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send back to repair" }),
    );

    await waitFor(() => expect(setData).toHaveBeenCalled());
    const [back] = setData.mock.calls[0][0];
    expect(back.status).toBe("in_progress");
    expect(back.events[back.events.length - 1].stage).toBe("in_repair");
  });
});
