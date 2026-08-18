import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({ current: null }));
const photoRequirements = vi.hoisted(() => ({
  current: { componentPhotoRequired: true },
}));
const photoStorage = vi.hoisted(() => ({
  savePhoto: vi.fn(async () => "idb://photo"),
}));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/features/componentRegistry/useComponentRegistry", () => ({
  useComponentRegistry: () => registry.current,
}));
vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: ({ label, value, onChange, error }) => (
    <div>
      <button type="button" onClick={() => onChange({ raw: "r", src: "s" })}>
        {label}
      </button>
      {value ? <span>photo attached</span> : null}
      {error ? <span>{error}</span> : null}
    </div>
  ),
}));
// Both reach for providers the app supplies and a bare render does not.
vi.mock("@/app/hooks/useVoiceControl", () => ({
  useVoiceControl: () => ({
    startVoiceInput: vi.fn(),
    stopVoiceInput: vi.fn(),
  }),
}));
vi.mock("@/app/project/hooks/usePhotoRequirements", () => ({
  usePhotoRequirements: () => photoRequirements.current,
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({
    savePhoto: photoStorage.savePhoto,
    ready: true,
  }),
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
        userProfile={{ name: "Мухиддин" }}
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
        { id: "a", component_uid: "1", component: "Задвижка" },
        { id: "b", component_uid: "2", component: "Труба" },
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
          component: "Задвижка",
          location: "УППГ",
        },
        {
          id: "b",
          component_uid: "2",
          component: "Труба",
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
          component: "Задвижка",
          scheme_tag: "ЗД32",
        },
        {
          id: "b",
          component_uid: "2",
          component: "Труба",
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

  it("will not let an unsigned walker write to the registry", () => {
    // Every history entry is signed; a registry nobody signs is a list of
    // assertions with no one behind them.
    renderRegistry({ userProfile: { name: "  " } });

    expect(screen.getByText("Add component").disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(
      /Set your name in the profile/i,
    );
  });

  it("says nothing about conflicts when there are none", () => {
    renderRegistry();
    expect(screen.queryByText(/duplicated number/i)).toBeNull();
  });

  it("reports colliding numbers after a merge and offers to isolate them", () => {
    // Two devices with no allotted ranges collide by design; the merge keeps
    // both cards and the screen has to say which ones need a decision.
    const clash = [
      { id: "a", component_uid: "7", component: "Задвижка" },
      { id: "b", component_uid: "7", component: "Манометр" },
    ];
    registry.current = makeRegistry({
      components: [
        ...clash,
        { id: "c", component_uid: "8", component: "Труба" },
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
        { id: "a", component_uid: "7", component: "Задвижка" },
        { id: "c", component_uid: "8", component: "Труба" },
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
        { id: "a", component_uid: "7", component: "Задвижка" },
        { id: "c", component_uid: "8", component: "Труба" },
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

  it("opens a blank card with the number left to the walker", () => {
    // The number goes on a tag the walker assigns; one already sitting in the
    // field invites being left as it is.
    renderRegistry();

    fireEvent.click(screen.getByText("Add component"));

    expect(screen.getByText("New component")).toBeTruthy();
    expect(screen.getByLabelText(/Индивидуальный номер/).value).toBe("");
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
            userProfile={{ name: "Мухиддин" }}
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
    fireEvent.change(screen.getByLabelText(/Компонент/), {
      target: { value: "Задвижка" },
    });
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "14" },
    });
    spies.onCloseCard.mockClear();
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByText("Фото компонента"));
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

  function fillNumber(value = "14") {
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value },
    });
  }

  function attachPhoto() {
    fireEvent.click(screen.getByText("Фото компонента"));
  }

  /**
   * The leak form's footer offers Save on the last step only, and each step is
   * now gated, so the number has to be answered before the walk can move on.
   */
  function goToLastStep() {
    fillNumber();
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
  }

  function fillRequired() {
    goToLastStep();
    attachPhoto();
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
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
  });

  it("will not leave the first step without the identity number", () => {
    // Каждый шаг заперт: пропущенное обязательное поле ловится там, где его
    // спрашивают, а не через три экрана у кнопки сохранения.
    openBlankCard();

    fireEvent.click(screen.getByText("Next →"));

    expect(screen.getByText(/Step 1 \/ 4/)).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
  });

  it("moves on once the number is answered", () => {
    openBlankCard();
    fillNumber();

    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText(/Step 2 \/ 4/)).toBeTruthy();
  });

  it("asks nothing of the passport steps", () => {
    openBlankCard();
    fillNumber();

    fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText(/Step 4 \/ 4/)).toBeTruthy();
  });

  it("will not save without a photograph of the equipment", async () => {
    openBlankCard();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(
        screen.getByText("A photo of the component is required"),
      ).toBeTruthy(),
    );
    expect(registry.current.addComponent).not.toHaveBeenCalled();
  });

  it("keeps the photo requirement off when settings turn it off", async () => {
    photoRequirements.current = { componentPhotoRequired: false };
    openBlankCard();
    goToLastStep();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    photoRequirements.current = { componentPhotoRequired: true };
  });

  it("saves a card with the passport steps left empty", async () => {
    openBlankCard();
    fillRequired();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    expect(
      registry.current.addComponent.mock.calls[0][0].manufacturer,
    ).toBeUndefined();
  });

  it("derives the English name without asking for it", async () => {
    // The workbook expects the column; writing the same equipment down twice
    // only invites the two spellings to disagree.
    openBlankCard();
    expect(screen.queryByLabelText(/Component name/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Локация/), {
      target: { value: "УППГ" },
    });
    fireEvent.change(screen.getByLabelText(/Компонент/), {
      target: { value: "Задвижка" },
    });
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "14" },
    });
    goToLastStep();
    attachPhoto();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    expect(
      registry.current.addComponent.mock.calls[0][0].component_name_en,
    ).toBe("Gate valve");
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
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
  });

  it("rejects a number that is not digits", async () => {
    openBlankCard();
    // Letters never reach the form — the numeric input strips them, so "ЗД32"
    // would arrive as "32". A decimal separator does get through.
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "1.5" },
    });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
    attachPhoto();
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
          component: "Задвижка",
          location: "УППГ",
        },
      ],
    });
    renderRegistry();

    fireEvent.click(screen.getByText("Задвижка"));
    expect(screen.getByText("Component card")).toBeTruthy();

    // The stored card already carries its number, so paging needs nothing.
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
    attachPhoto();
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
    registry.current = makeRegistry();
  });

  it("offers to clear the step only once something is in it", () => {
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(screen.queryByText("Clear step")).toBeNull();
    expect(screen.getByText("Clear all")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Компонент/), {
      target: { value: "Задвижка" },
    });
    expect(screen.getByText("Clear step")).toBeTruthy();
  });

  it("keeps the number and the fix when clearing", () => {
    renderRegistry({ coords: { lat: 38.4, lng: 66.1 } });
    fireEvent.click(screen.getByText("Add component"));

    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText(/Компонент/), {
      target: { value: "Задвижка" },
    });
    fireEvent.click(screen.getByText("Clear step"));

    // Identity and position are not what the button is for.
    expect(screen.getByDisplayValue("14")).toBeTruthy();
    expect(screen.getByLabelText(/Компонент/).value).toBe("");
  });

  it("returns to the first step when clearing everything", () => {
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "14" },
    });
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
    fireEvent.change(screen.getByLabelText(/Компонент/), {
      target: { value: "Задвижка" },
    });
    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "14" },
    });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByText("Фото компонента"));
    fireEvent.click(screen.getByText("Save"));
  }

  it("keeps the worked example in the input, not the previous value", () => {
    // The example is what tells a walker the shape of the answer; the previous
    // card's value used to sit in the same place and hide it.
    registry.current = makeRegistry({
      lastComponent: {
        id: "prev",
        component_uid: "6",
        component: "Манометр",
        scheme_tag: "PG",
      },
    });
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(screen.getByLabelText(/Подразделение/).placeholder).toBe(
      "e.g. Messoyakha gas plant",
    );
    expect(screen.getByLabelText(/Номер на схеме/).placeholder).not.toBe("PG");
  });

  it("explains what each field wants", () => {
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(
      screen.getByText("Name of the division the component belongs to"),
    ).toBeTruthy();
    expect(
      screen.getByText("The number you assign during the walk. Digits only"),
    ).toBeTruthy();
  });

  it("asks before filling anything", async () => {
    openWithPrevious({
      id: "prev",
      component: "Манометр",
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
      component: "Манометр",
      manufacturer: "Завод",
      body_material: "Сталь 20",
    });

    await waitFor(() => screen.getByText("Fill"));
    fireEvent.click(screen.getByText("Fill"));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
    );
    const saved = registry.current.addComponent.mock.calls[0][0];
    expect(saved.component).toBe("Задвижка");
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
    openWithPrevious({ id: "prev", component: "Манометр" });

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
