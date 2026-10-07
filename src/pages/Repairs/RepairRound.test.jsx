import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  default: ({ leak, badge, onMonitor, onOpenDetails, monitorLabel }) => (
    <div>
      {leak.leak_id} {badge?.label}
      <button type="button" onClick={() => onOpenDetails(leak)}>
        swipe-right
      </button>
      {onMonitor && (
        <button type="button" onClick={() => onMonitor(leak)}>
          swipe-left {monitorLabel}
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/features/leakDetails/LeakDetailsSheet", () => ({
  default: ({ leak, onClose }) => (
    <div role="dialog" aria-label={`details ${leak.leak_id}`}>
      <button type="button" onClick={onClose}>
        close-details
      </button>
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

// Отмечен 3 октября — проверен в обходе, начатом 2-го.
const checkedRepair = (id) =>
  repair(id, {
    events: [
      started,
      {
        id: "m",
        type: "repair_stage",
        date: "2026-10-03T08:00:00Z",
        stage: "in_repair",
      },
    ],
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
  it("opens the leak card on swipe right and checks the repair on swipe left", async () => {
    renderRound([repair("r1")]);

    fireEvent.click(screen.getByRole("button", { name: "swipe-right" }));
    expect(
      await screen.findByRole("dialog", { name: "details R1" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "close-details" }));
    expect(screen.queryByRole("dialog", { name: "details R1" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "swipe-left Check repair" }),
    );
    expect(await screen.findByLabelText("Still leaking?")).toBeTruthy();
  });

  it("counts work in progress and checks a repair with the crew", async () => {
    const resolved = { id: "o", status: "resolved", events: [] };
    const setData = renderRound([repair("r1"), resolved]);

    // Устранённый до обхода в проверке не участвует — только во «Всех».
    expect(screen.getByRole("button", { name: "Due 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Checked 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All repairs 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.change(await screen.findByLabelText("Still leaking?"), {
      target: { value: "yes" },
    });
    fireEvent.change(screen.getByLabelText("Crew"), {
      target: { value: "Crew 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep in repair" }));

    await waitFor(() => expect(setData).toHaveBeenCalled());
    const [saved, untouched] = setData.mock.calls[0][0];
    expect(saved.events[saved.events.length - 1]).toMatchObject({
      type: "repair_stage",
      stage: "in_repair",
      brigade: "Crew 2",
      user: "Ivan",
    });
    expect(untouched).toEqual(resolved);
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

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.change(await screen.findByLabelText("Still leaking?"), {
      target: { value: "yes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep in repair" }));

    await waitFor(() => expect(setData).toHaveBeenCalled());
    const [back] = setData.mock.calls[0][0];
    expect(back.status).toBe("in_progress");
    expect(back.events[back.events.length - 1].stage).toBe("in_repair");
  });

  it("returns the leak to open when the repair was not done", async () => {
    const setData = renderRound([repair("r4")]);

    // Свайп влево по карточке — проверка ремонта.
    fireEvent.click(
      screen.getAllByRole("button", { name: "swipe-left Check repair" })[0],
    );
    fireEvent.change(await screen.findByLabelText("Still leaking?"), {
      target: { value: "yes" },
    });
    fireEvent.change(screen.getByLabelText("Repair done?"), {
      target: { value: "no" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Back to awaiting materials" }),
    );

    await waitFor(() => expect(setData).toHaveBeenCalled());
    const [back] = setData.mock.calls[0][0];
    expect(back.status).toBe("open");
  });

  it("starts the first round with the first check", async () => {
    localStorage.clear();
    renderRound([repair("r5")]);
    expect(screen.getByText("No repair round yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.change(await screen.findByLabelText("Still leaking?"), {
      target: { value: "yes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep in repair" }));

    expect(await screen.findByText("Repair round № 1")).toBeTruthy();
  });

  it("asks before checking a repair already checked in the round", async () => {
    localStorage.clear();
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 2, startedAt: "2026-10-02T00:00:00.000Z" }),
    );
    renderRound([checkedRepair("r7")]);

    expect(screen.getByRole("button", { name: "Checked 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Checked 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(
      screen.getByText("Repair already checked in this round"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Still leaking?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByLabelText("Still leaking?")).toBeTruthy();
  });

  it("starts a new round from the repeat prompt and opens the check", async () => {
    localStorage.clear();
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 2, startedAt: "2026-10-02T00:00:00.000Z" }),
    );
    renderRound([checkedRepair("r8")]);

    fireEvent.click(screen.getByRole("button", { name: "Checked 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Start a new round" }));
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));

    expect(await screen.findByLabelText("Still leaking?")).toBeTruthy();
    expect(screen.getByText("Repair round № 3")).toBeTruthy();
  });

  it("closes a repair without a photo when the project does not require it", async () => {
    localStorage.setItem(
      "app:p1:photo_requirements_v1",
      JSON.stringify({ repairPhotoRequired: false }),
    );
    const setData = renderRound([repair("r9")]);

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByLabelText("Still leaking?");
    fireEvent.click(
      screen.getByRole("button", { name: "Accept and close repair" }),
    );

    await waitFor(() => expect(setData).toHaveBeenCalled());
    expect(setData.mock.calls[0][0][0].status).toBe("resolved");
    localStorage.removeItem("app:p1:photo_requirements_v1");
  });

  it("rechecks a repair closed in this round but not an older one", async () => {
    localStorage.clear();
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 2, startedAt: "2026-10-02T00:00:00.000Z" }),
    );
    const done = (id, date) =>
      repair(id, {
        status: "resolved",
        events: [started, { id: "d", type: "repair_done", date }],
      });
    renderRound([done("closed-now", "2026-10-03T08:00:00Z")]);
    fireEvent.click(screen.getByRole("button", { name: "Checked 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(
      await screen.findByRole("button", { name: "Confirm resolved" }),
    ).toBeTruthy();
    cleanup();

    renderRound([done("closed-before", "2026-09-20T08:00:00Z")]);
    fireEvent.click(screen.getByRole("button", { name: "All repairs 1" }));
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("filters the round with the same filter bar as monitoring", () => {
    localStorage.clear();
    renderRound([repair("r10"), repair("r11", { status: "open" })]);

    expect(screen.getByRole("button", { name: "Due 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    // Статус в ремонтах — стадией: «Ожидает МТР» — открытые.
    fireEvent.click(screen.getByRole("button", { name: /Awaiting materials/ }));
    expect(screen.getByRole("button", { name: "Due 1" })).toBeTruthy();
    expect(screen.getByText(/R11/)).toBeTruthy();
    expect(screen.queryByText(/R10/)).toBeNull();
  });

  it("offers to finish a round once every repair in it is checked", () => {
    localStorage.clear();
    localStorage.setItem(
      "app:p1:repair_round_v1",
      JSON.stringify({ number: 2, startedAt: "2026-10-02T00:00:00.000Z" }),
    );
    const marked = repair("r6", {
      events: [
        started,
        {
          id: "m",
          type: "repair_stage",
          date: "2026-10-03T08:00:00Z",
          stage: "in_repair",
        },
      ],
    });
    renderRound([marked]);

    expect(screen.getByText("Every repair checked")).toBeTruthy();
    expect(screen.getByText("1/1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish round" }));
    expect(screen.getByText("Round finished")).toBeTruthy();
  });
});
