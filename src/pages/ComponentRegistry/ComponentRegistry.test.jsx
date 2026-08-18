import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

/**
 * Mirrors how the app routes the registry: the card is a page of its own, and
 * page and card are kept in step in both directions. Tested through the real
 * wiring rather than around it — syncing one way only was exactly the bug that
 * left a card on screen with the navigation already back underneath it.
 */
function renderRegistry(props = {}) {
  const spies = { onOpenCard: vi.fn(), onCloseCard: vi.fn() };

  function Harness() {
    const [page, setPage] = useState("components");
    return (
      <ComponentRegistry
        project={project}
        {...props}
        cardPage={page === "component"}
        onOpenCard={() => {
          spies.onOpenCard();
          setPage("component");
        }}
        onCloseCard={() => {
          spies.onCloseCard();
          setPage("components");
        }}
      />
    );
  }

  return { ...render(<Harness />), spies };
}

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
    const { container } = renderRegistry();
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
    renderRegistry();

    expect(screen.getByText("Recorded: 2")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("invites the first card when the registry is empty", () => {
    renderRegistry();
    expect(screen.getByText(/registry is empty/i)).toBeTruthy();
  });

  it("reports a read failure instead of looking empty", () => {
    registry.current = makeRegistry({ error: new Error("boom") });
    renderRegistry();
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
    renderRegistry();

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
    renderRegistry();

    fireEvent.change(screen.getByLabelText(/Number, name, drawing tag/i), {
      target: { value: "зд32" },
    });

    expect(screen.getByText("Задвижка")).toBeTruthy();
    expect(screen.queryByText("Труба")).toBeNull();
  });

  it("says nothing about conflicts when there are none", () => {
    renderRegistry();
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
    renderRegistry();

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
    const { container } = renderRegistry();

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
    renderRegistry();

    fireEvent.click(screen.getByText("Show them"));
    expect(screen.queryByText("Труба")).toBeNull();

    fireEvent.click(screen.getByText("Show all"));
    expect(screen.getByText("Труба")).toBeTruthy();
  });

  it("opens a blank card prefilled with the suggested number", () => {
    registry.current = makeRegistry({ suggestNextUid: vi.fn(() => "113") });
    renderRegistry();

    fireEvent.click(screen.getByText("Add component"));

    expect(screen.getByText("New component")).toBeTruthy();
    expect(screen.getByDisplayValue("113")).toBeTruthy();
  });
});

describe("card page switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.current = makeRegistry();
  });

  it("asks for the full-screen page when a card opens", () => {
    // The card hides the app header and the bottom navigation, so it has to be
    // a page of its own rather than a panel inside the registry.
    const { spies } = renderRegistry();

    fireEvent.click(screen.getByText("Add component"));
    expect(spies.onOpenCard).toHaveBeenCalledTimes(1);
    expect(screen.getByText("New component")).toBeTruthy();
  });

  it("returns to the list page when the card is left", () => {
    const { spies } = renderRegistry();

    fireEvent.click(screen.getByText("Add component"));
    spies.onCloseCard.mockClear();
    fireEvent.click(screen.getByLabelText("Cancel"));

    expect(spies.onCloseCard).toHaveBeenCalled();
    expect(screen.getByText("Add component")).toBeTruthy();
  });

  it("closes the card when the page is left from outside the form", () => {
    // The hardware back button navigates history rather than pressing the
    // header arrow; the card has to follow.
    function Harness() {
      const [page, setPage] = useState("components");
      return (
        <>
          <button type="button" onClick={() => setPage("components")}>
            hardware back
          </button>
          <ComponentRegistry
            project={project}
            cardPage={page === "component"}
            onOpenCard={() => setPage("component")}
            onCloseCard={() => setPage("components")}
          />
        </>
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByText("Add component"));
    expect(screen.getByText("New component")).toBeTruthy();

    fireEvent.click(screen.getByText("hardware back"));
    expect(screen.queryByText("New component")).toBeNull();
    expect(screen.getByText("Add component")).toBeTruthy();
  });

  it("returns to the list page after a card is saved", async () => {
    const { spies } = renderRegistry();

    fireEvent.click(screen.getByText("Add component"));
    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Задвижка" },
    });
    spies.onCloseCard.mockClear();
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(spies.onCloseCard).toHaveBeenCalled());
  });

  it("corrects a page left pointing at a card that is not open", () => {
    // A reload remembers the page value but not which card was being filled in.
    const onCloseCard = vi.fn();
    render(
      <ComponentRegistry
        project={project}
        cardPage
        onCloseCard={onCloseCard}
      />,
    );
    expect(onCloseCard).toHaveBeenCalled();
  });
});

describe("component card form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.current = makeRegistry();
  });

  function openBlankCard(coords = null) {
    renderRegistry({ coords: coords });
    fireEvent.click(screen.getByText("Add component"));
  }

  /** The leak form's footer offers Save on the last step only. */
  function goToLastStep() {
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
  }

  function fillRequired() {
    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Задвижка" },
    });
  }

  it("wears the leak form's header, with the step in it", () => {
    openBlankCard();
    expect(screen.getByText("New component")).toBeTruthy();
    expect(screen.getByText(/Step 1 \/ 4/)).toBeTruthy();
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  it("leaves the card through the header, as the leak form does", () => {
    openBlankCard();
    fireEvent.click(screen.getByLabelText("Cancel"));
    expect(screen.getByText("Add component")).toBeTruthy();
  });

  it("records the fix without ever asking for it", () => {
    openBlankCard({ lat: 38.4769, lng: 66.1466 });

    // No field for a number the app already has.
    expect(screen.queryByLabelText(/Координата/)).toBeNull();

    fillRequired();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    return waitFor(() => {
      const saved = registry.current.addComponent.mock.calls[0][0];
      expect(saved.lat).toBe(38.4769);
      expect(saved.lng).toBe(66.1466);
    });
  });

  it("writes the card even when no fix ever arrived", async () => {
    // Indoors a receiver reports nothing; that must not stop the walk.
    openBlankCard(null);
    fillRequired();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
  });

  it("blocks saving only on the fields readable without a plate", async () => {
    openBlankCard();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(screen.getAllByText("Required").length).toBeGreaterThan(0),
    );
    expect(registry.current.addComponent).not.toHaveBeenCalled();
    // Two of the three are blank; the number came prefilled.
    expect(screen.getAllByText("Required")).toHaveLength(2);
  });

  it("sends the operator to the step holding the problem", async () => {
    openBlankCard();
    goToLastStep();
    expect(screen.getByText(/Step 4 \/ 4/)).toBeTruthy();

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText(/Step 1 \/ 4/)).toBeTruthy());
  });

  it("saves a card with the passport steps left empty", async () => {
    openBlankCard();
    fillRequired();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    expect(
      registry.current.addComponent.mock.calls[0][0].manufacturer,
    ).toBeUndefined();
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

    fillRequired();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
  });

  it("rejects a number that is not digits", async () => {
    openBlankCard();
    fillRequired();
    // Letters never reach the form — the numeric input strips them, so "ЗД32"
    // would arrive as "32". A decimal separator does get through.
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "1.5" },
    });
    goToLastStep();
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
    renderRegistry();

    fireEvent.click(screen.getByText("Задвижка"));
    expect(screen.getByText("Component card")).toBeTruthy();

    goToLastStep();
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(registry.current.updateComponent).toHaveBeenCalledWith(
        "a",
        expect.objectContaining({ component_uid: "7" }),
      ),
    );
  });
});

describe("clearing a card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.current = makeRegistry({ suggestNextUid: vi.fn(() => "9") });
  });

  it("offers to clear the step only once something is in it", () => {
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    // The number arrives prefilled, so the step already has data.
    expect(screen.getByText("Clear step")).toBeTruthy();
    expect(screen.getByText("Clear all")).toBeTruthy();
  });

  it("keeps the number and the fix when clearing", () => {
    renderRegistry({ coords: { lat: 38.4, lng: 66.1 } });
    fireEvent.click(screen.getByText("Add component"));

    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Задвижка" },
    });
    fireEvent.click(screen.getByText("Clear step"));

    // Identity and position are not what the button is for.
    expect(screen.getByDisplayValue("9")).toBeTruthy();
    expect(screen.getByLabelText(/Наименование компонента/).value).toBe("");
  });

  it("returns to the first step when clearing everything", () => {
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText(/Step 2 \/ 4/)).toBeTruthy();

    fireEvent.click(screen.getByText("Clear all"));
    expect(screen.getByText(/Step 1 \/ 4/)).toBeTruthy();
  });
});

describe("copying from the previous card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openWithPrevious(lastComponent) {
    registry.current = makeRegistry({ lastComponent });
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));
    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Наименование компонента/), {
      target: { value: "Задвижка" },
    });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByText("Save"));
  }

  it("shows the previous values as hints in the empty fields", () => {
    // Walking a row of identical gauges means most of the passport repeats.
    registry.current = makeRegistry({
      lastComponent: {
        id: "prev",
        component_uid: "6",
        component_name: "Манометр",
        scheme_tag: "PG",
      },
    });
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(screen.getByLabelText(/Наименование компонента/).placeholder).toBe(
      "Манометр",
    );
    expect(screen.getByLabelText(/Номер на схеме/).placeholder).toBe("PG");
  });

  it("never echoes the previous identity number", () => {
    registry.current = makeRegistry({
      lastComponent: { id: "prev", component_uid: "6" },
    });
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(
      screen.getByLabelText(/Индивидуальный номер/).placeholder.trim(),
    ).toBe("");
  });

  it("drops the hint once the field is filled in", () => {
    registry.current = makeRegistry({
      lastComponent: { id: "prev", component_name: "Манометр" },
    });
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    const name = screen.getByLabelText(/Наименование компонента/);
    expect(name.placeholder).toBe("Манометр");

    fireEvent.change(name, { target: { value: "Задвижка" } });
    expect(
      screen.getByLabelText(/Наименование компонента/).placeholder.trim(),
    ).toBe("");
  });

  it("asks before filling anything", async () => {
    openWithPrevious({
      id: "prev",
      component_name: "Манометр",
      manufacturer: "Завод",
    });

    await waitFor(() =>
      expect(screen.getByText(/Fill from the previous card/i)).toBeTruthy(),
    );
    expect(registry.current.addComponent).not.toHaveBeenCalled();
  });

  it("copies only what was left empty, never what was typed", async () => {
    openWithPrevious({
      id: "prev",
      component_name: "Манометр",
      manufacturer: "Завод",
      body_material: "Сталь 20",
    });

    await waitFor(() => screen.getByText("Fill"));
    fireEvent.click(screen.getByText("Fill"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    const saved = registry.current.addComponent.mock.calls[0][0];
    expect(saved.component_name).toBe("Задвижка");
    expect(saved.manufacturer).toBe("Завод");
    expect(saved.body_material).toBe("Сталь 20");
  });

  it("saves the card untouched when the offer is declined", async () => {
    openWithPrevious({ id: "prev", manufacturer: "Завод" });

    await waitFor(() => screen.getByText("Leave empty"));
    fireEvent.click(screen.getByText("Leave empty"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    // An unreadable plate is a fact about this component, not a gap to paper
    // over with the previous one's values.
    expect(
      registry.current.addComponent.mock.calls[0][0].manufacturer,
    ).toBeUndefined();
  });

  it("does not ask when the previous card has nothing to give", async () => {
    openWithPrevious({ id: "prev", component_name: "Манометр" });

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByText(/Fill from the previous card/i)).toBeNull();
  });

  it("does not ask on the first card of a walk", async () => {
    openWithPrevious(null);

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByText(/Fill from the previous card/i)).toBeNull();
  });
});
