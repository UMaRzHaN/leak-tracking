import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({ current: null }));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/features/componentRegistry/useComponentRegistry", () => ({
  useComponentRegistry: () => registry.current,
}));
vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: ({ label }) => <div>{label}</div>,
}));

const ComponentRegistry = (await import("./ComponentRegistry")).default;
// The real declaration, so the form under test renders the fields it will in
// production rather than a fixture that can drift away from the config.
const { COMPONENT_STEPS } =
  await import("@/configs/upstream/data/componentSteps");

const project = { id: "p1", type: "upstream", folderName: "buzahur" };

function makeRegistry(overrides = {}) {
  return {
    enabled: true,
    steps: { mode: "manual", steps: COMPONENT_STEPS },
    components: [],
    loading: false,
    error: null,
    addComponent: vi.fn().mockResolvedValue([]),
    updateComponent: vi.fn().mockResolvedValue([]),
    removeComponent: vi.fn().mockResolvedValue([]),
    suggestNextUid: vi.fn(() => "1"),
    findConflicts: vi.fn(() => []),
    ...overrides,
  };
}

describe("ComponentRegistry screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.current = makeRegistry();
  });

  it("renders nothing for a project type without a registry", () => {
    registry.current = makeRegistry({ enabled: false });
    const { container } = render(<ComponentRegistry project={project} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts what has been recorded, never a percentage", () => {
    // The total number of components on the field is unknown by design, so a
    // percentage here would be invented.
    registry.current = makeRegistry({
      components: [
        { id: "a", component_uid: "1", component_name: "Задвижка" },
        { id: "b", component_uid: "2", component_name: "Труба" },
      ],
    });
    render(<ComponentRegistry project={project} />);

    expect(screen.getByText("Recorded: 2")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("invites the first card when the registry is empty", () => {
    render(<ComponentRegistry project={project} />);
    expect(screen.getByText(/registry is empty/i)).toBeTruthy();
  });

  it("reports a read failure instead of looking empty", () => {
    registry.current = makeRegistry({ error: new Error("boom") });
    render(<ComponentRegistry project={project} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not read/i);
  });

  it("filters by location", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component_name: "Задвижка",
          location: "УППГ",
        },
        {
          id: "b",
          component_uid: "2",
          component_name: "Труба",
          location: "Скважина 22",
        },
      ],
    });
    render(<ComponentRegistry project={project} />);

    fireEvent.change(screen.getByLabelText("Filter by location"), {
      target: { value: "УППГ" },
    });

    expect(screen.getByText("Задвижка")).toBeTruthy();
    expect(screen.queryByText("Труба")).toBeNull();
  });

  it("searches across the card, not just the name", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component_name: "Задвижка",
          scheme_tag: "ЗД32",
        },
        {
          id: "b",
          component_uid: "2",
          component_name: "Труба",
          scheme_tag: "—",
        },
      ],
    });
    render(<ComponentRegistry project={project} />);

    fireEvent.change(screen.getByLabelText(/Number, name, drawing tag/i), {
      target: { value: "зд32" },
    });

    expect(screen.getByText("Задвижка")).toBeTruthy();
    expect(screen.queryByText("Труба")).toBeNull();
  });

  it("opens a blank card prefilled with the suggested number", () => {
    registry.current = makeRegistry({ suggestNextUid: vi.fn(() => "113") });
    render(<ComponentRegistry project={project} />);

    fireEvent.click(screen.getByText("Add component"));

    expect(screen.getByText("New component")).toBeTruthy();
    expect(screen.getByDisplayValue("113")).toBeTruthy();
  });
});

describe("component card form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.current = makeRegistry();
  });

  function openBlankCard() {
    render(<ComponentRegistry project={project} />);
    fireEvent.click(screen.getByText("Add component"));
  }

  it("blocks saving only on the three fields readable without a plate", async () => {
    openBlankCard();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(screen.getAllByText("Required").length).toBeGreaterThan(0),
    );
    expect(registry.current.addComponent).not.toHaveBeenCalled();
    // Two of the three are still blank; the number came prefilled.
    expect(screen.getAllByText("Required")).toHaveLength(2);
  });

  it("saves from the first step without visiting the passport steps", async () => {
    openBlankCard();

    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "Скважина 22" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Задвижка" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    const saved = registry.current.addComponent.mock.calls[0][0];
    expect(saved.manufacturer).toBeUndefined();
    expect(saved.component_name).toBe("Задвижка");
  });

  it("fills the English name from the Russian one", async () => {
    openBlankCard();

    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Задвижка" },
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("Gate valve")).toBeTruthy(),
    );
  });

  it("warns about a duplicate number but still saves it", async () => {
    // The app cannot see another device's numbers; refusing here would only
    // strand somebody at a wellhead.
    registry.current = makeRegistry({
      findConflicts: vi.fn(() => [{ id: "other", component_uid: "1" }]),
    });
    openBlankCard();

    expect(screen.getByRole("status").textContent).toMatch(
      /already in the registry/i,
    );

    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Труба" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
  });

  it("rejects a number that is not digits", async () => {
    openBlankCard();

    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Труба" },
    });
    // Letters never reach the form — the numeric input strips them, so "ЗД32"
    // would arrive as "32". A decimal separator does get through, and "1.5" is
    // not an identity number.
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByText("Digits only")).toBeTruthy());
    expect(registry.current.addComponent).not.toHaveBeenCalled();
  });

  it("edits an existing card in place", async () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "7",
          component_name: "Задвижка",
          location: "УППГ",
        },
      ],
    });
    render(<ComponentRegistry project={project} />);

    fireEvent.click(screen.getByText("Задвижка"));
    expect(screen.getByText("Component card")).toBeTruthy();

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(registry.current.updateComponent).toHaveBeenCalledWith(
        "a",
        expect.objectContaining({ component_uid: "7" }),
      ),
    );
  });
});
