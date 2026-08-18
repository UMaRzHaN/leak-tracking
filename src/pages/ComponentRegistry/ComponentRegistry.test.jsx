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
const { FIELDS: COMPONENT_FIELDS } =
  await import("@/configs/upstream/data/componentFields");

const project = { id: "p1", type: "upstream", folderName: "buzahur" };

function makeRegistry(overrides = {}) {
  return {
    enabled: true,
    steps: { mode: "manual", steps: COMPONENT_STEPS },
    components: [],
    conflicts: [],
    conflictingIds: new Set(),
    fields: { copyable: COMPONENT_FIELDS.filter((f) => f.copyable) },
    lastComponent: null,
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

  it("says nothing about conflicts when there are none", () => {
    render(<ComponentRegistry project={project} />);
    expect(screen.queryByText(/duplicated number/i)).toBeNull();
  });

  it("reports colliding numbers after a merge and offers to isolate them", () => {
    // Two devices with no allotted ranges collide by design; the merge keeps
    // both cards and the screen has to say which ones need a decision.
    const clash = [
      { id: "a", component_uid: "7", component_name: "Задвижка" },
      { id: "b", component_uid: "7", component_name: "Манометр" },
    ];
    registry.current = makeRegistry({
      components: [
        ...clash,
        { id: "c", component_uid: "8", component_name: "Труба" },
      ],
      conflicts: [{ uid: "7", records: clash }],
      conflictingIds: new Set(["a", "b"]),
    });
    render(<ComponentRegistry project={project} />);

    expect(screen.getByRole("status").textContent).toMatch(
      /1 duplicated number/i,
    );
    expect(screen.getByText("Труба")).toBeTruthy();

    fireEvent.click(screen.getByText("Show them"));

    expect(screen.getByText("Задвижка")).toBeTruthy();
    expect(screen.getByText("Манометр")).toBeTruthy();
    expect(screen.queryByText("Труба")).toBeNull();
  });

  it("marks the colliding cards in the list itself", () => {
    registry.current = makeRegistry({
      components: [
        { id: "a", component_uid: "7", component_name: "Задвижка" },
        { id: "c", component_uid: "8", component_name: "Труба" },
      ],
      conflicts: [{ uid: "7", records: [{ id: "a" }, { id: "b" }] }],
      conflictingIds: new Set(["a"]),
    });
    const { container } = render(<ComponentRegistry project={project} />);

    const marked = container.querySelectorAll("[data-conflict]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe("7");
  });

  it("goes back to the whole registry from the conflict view", () => {
    registry.current = makeRegistry({
      components: [
        { id: "a", component_uid: "7", component_name: "Задвижка" },
        { id: "c", component_uid: "8", component_name: "Труба" },
      ],
      conflicts: [{ uid: "7", records: [{ id: "a" }, { id: "b" }] }],
      conflictingIds: new Set(["a"]),
    });
    render(<ComponentRegistry project={project} />);

    fireEvent.click(screen.getByText("Show them"));
    expect(screen.queryByText("Труба")).toBeNull();

    fireEvent.click(screen.getByText("Show all"));
    expect(screen.getByText("Труба")).toBeTruthy();
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

  it("stamps the current fix onto a new card", async () => {
    render(
      <ComponentRegistry
        project={project}
        coords={{ lat: 38.4769, lng: 66.1466 }}
      />,
    );
    fireEvent.click(screen.getByText("Add component"));
    // Coordinates sit on the last step, beside the photo.
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next"));

    expect(screen.getByDisplayValue("38.4769")).toBeTruthy();
    expect(screen.getByDisplayValue("66.1466")).toBeTruthy();
  });

  it("opens a card without a fix when the receiver has none", () => {
    render(<ComponentRegistry project={project} coords={null} />);
    fireEvent.click(screen.getByText("Add component"));
    // Indoors a fix never arrives; that must not stop the card being written.
    expect(screen.getByText("New component")).toBeTruthy();
  });

  it("keeps a stored fix instead of overwriting it on edit", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "7",
          component_name: "Задвижка",
          lat: 38.1,
          lng: 66.1,
        },
      ],
    });
    render(<ComponentRegistry project={project} coords={{ lat: 1, lng: 2 }} />);

    fireEvent.click(screen.getByText("Задвижка"));
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next"));

    expect(screen.getByDisplayValue("38.1")).toBeTruthy();
    expect(screen.queryByDisplayValue("1")).toBeNull();
  });

  it("refuses a coordinate that would land off the planet", async () => {
    render(<ComponentRegistry project={project} coords={null} />);
    fireEvent.click(screen.getByText("Add component"));

    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Труба" },
    });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next"));
    fireEvent.change(screen.getByLabelText(/Координата X/), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(screen.getByText("Coordinate is out of range")).toBeTruthy(),
    );
    expect(registry.current.addComponent).not.toHaveBeenCalled();
  });

  it("saves a coordinate corrected by hand", async () => {
    render(
      <ComponentRegistry project={project} coords={{ lat: 38.4, lng: 66.1 }} />,
    );
    fireEvent.click(screen.getByText("Add component"));

    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Труба" },
    });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next"));
    fireEvent.change(screen.getByLabelText(/Координата X/), {
      target: { value: "38.5" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    // The form hands over what was typed; storage coerces it to a number —
    // see normalizeComponent.
    expect(registry.current.addComponent.mock.calls[0][0].lat).toBe("38.5");
  });

  it("offers the previous card's values as hints in the empty fields", () => {
    // Walking a row of identical gauges means most of the passport repeats.
    registry.current = makeRegistry({
      lastComponent: {
        id: "prev",
        component_uid: "6",
        component_name: "Манометр",
        scheme_tag: "PG",
        location: "Скважина 22",
      },
    });
    openBlankCard();

    expect(screen.getByLabelText(/Наименование компонента/).placeholder).toBe(
      "Манометр",
    );
    expect(screen.getByLabelText(/Номер на схеме/).placeholder).toBe("PG");
  });

  it("never echoes the previous number or its coordinates", () => {
    // The identity number is suggested from the highest already used, and a
    // fix belongs to the piece of equipment in front of you.
    registry.current = makeRegistry({
      lastComponent: {
        id: "prev",
        component_uid: "6",
        component_name: "Манометр",
        lat: 38.1,
        lng: 66.1,
      },
    });
    openBlankCard();

    // Blank in practice is a single space — the floating-label trick needs a
    // non-empty placeholder to size against.
    expect(
      screen.getByLabelText(/Индивидуальный номер/).placeholder.trim(),
    ).toBe("");

    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next"));
    expect(screen.getByLabelText(/Координата X/).placeholder.trim()).toBe("");
  });

  it("drops the hint once the field is filled in", () => {
    registry.current = makeRegistry({
      lastComponent: { id: "prev", component_name: "Манометр" },
    });
    openBlankCard();

    const name = screen.getByLabelText(/Наименование компонента/);
    expect(name.placeholder).toBe("Манометр");

    fireEvent.change(name, { target: { value: "Задвижка" } });
    expect(
      screen.getByLabelText(/Наименование компонента/).placeholder.trim(),
    ).toBe("");
  });

  it("shows no hints on the very first card of a walk", () => {
    openBlankCard();
    expect(
      screen.getByLabelText(/Наименование компонента/).placeholder.trim(),
    ).toBe("");
  });

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
