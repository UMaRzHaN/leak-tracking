import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({ current: null }));
const photoRequirements = vi.hoisted(() => ({
  current: { componentPhotoRequired: true },
}));
const photoStorage = vi.hoisted(() => ({
  savePhoto: vi.fn(async () => "idb://photo"),
}));

vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

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
  useVoiceControl: (options) => {
    voiceControl.options = options;
    return {
      pendingVoiceData: voiceControl.pending,
      dismissVoiceData: voiceControl.dismiss,
      startVoiceInput: voiceControl.start,
      stopVoiceInput: voiceControl.stop,
    };
  },
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

const voiceControl = {
  options: null,
  pending: null,
  dismiss: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

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
        // Приёмник по умолчанию отвечает: сохранение без фикса честно ждёт
        // его пятнадцать секунд, и это проверяется отдельным тестом.
        coords={{ lat: 38.4, lng: 66.1 }}
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
    fields: {
      all: COMPONENT_FIELDS,
      viewable: COMPONENT_FIELDS.filter((f) => f.viewable),
      copyable: COMPONENT_FIELDS.filter((f) => f.copyable),
    },
    voice: { outputFields: ["component"], synonymsFields: ["component"] },
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

  it("follows the place chosen in the header rather than its own list", () => {
    // One hierarchy, shared with the database, the map and the monitoring list.
    // A second selector beside the first would be two answers to one question.
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
    renderRegistry({
      sharedFilters: { locationFilter: { key: "location", values: ["УППГ"] } },
    });

    expect(screen.getByText("Задвижка")).toBeTruthy();
    expect(screen.queryByText("Труба")).toBeNull();
    expect(screen.queryByLabelText("Filter by location")).toBeNull();
  });

  it("filters by the state the hardware was found in", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component: "Задвижка",
          component_status: "В работе",
        },
        {
          id: "b",
          component_uid: "2",
          component: "Труба",
          component_status: "Требует замены",
        },
      ],
    });
    renderRegistry();

    // Фильтры прячутся за кнопкой, как на странице базы.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(
      screen.getByRole("button", { pressed: false, name: /Требует замены/ }),
    );

    expect(screen.getByText("Труба")).toBeTruthy();
    expect(screen.queryByText("Задвижка")).toBeNull();
  });

  it("offers only the states a walk actually found", () => {
    registry.current = makeRegistry({
      components: [
        { id: "a", component_uid: "1", component_status: "В работе" },
      ],
    });
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(
      screen.getByRole("button", { name: /В работе/, pressed: false }),
    ).toBeTruthy();
    // An empty button selects nothing and only adds to the noise.
    expect(screen.queryByRole("button", { name: /Демонтирован/ })).toBeNull();
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

  it("opens the card for reading, with its history and its delete", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "7",
          component: "Задвижка",
          location: "УППГ",
          history: [
            {
              action: "component_created",
              date: "2026-01-01T00:00:00.000Z",
              user: "Мухиддин",
            },
          ],
        },
      ],
    });
    renderRegistry();

    fireEvent.click(screen.getByText("Задвижка"));

    // The trail lives on its own tab, as it does on the leak sheet.
    fireEvent.click(screen.getByText("History"));
    expect(screen.getByText("Card created")).toBeTruthy();
    expect(screen.getByText("Мухиддин", { exact: false })).toBeTruthy();
    // Deletion lives behind the reading rather than one mis-tap away in the
    // list, и значком: слово рядом с «Редактировать» читалось бы как равный
    // по весу выбор, а он не равный.
    expect(
      screen.getByRole("button", { name: "Delete component" }),
    ).toBeTruthy();
  });

  it("asks twice before throwing a walked card away", () => {
    registry.current = makeRegistry({
      components: [{ id: "a", component_uid: "7", component: "Задвижка" }],
    });
    renderRegistry();

    fireEvent.click(screen.getByText("Задвижка"));
    fireEvent.click(screen.getByRole("button", { name: "Delete component" }));
    expect(registry.current.removeComponent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Delete for good"));
    expect(registry.current.removeComponent).toHaveBeenCalledWith("a");
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

  function openBlankCard(coords = { lat: 38.4, lng: 66.1 }) {
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

  it("waits for the receiver, then writes the card and says what was lost", async () => {
    // Indoors a receiver reports nothing; that must not stop the walk, and it
    // must not pass in silence either — the card would simply be off the map.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const setGpsEnabled = vi.fn();
      renderRegistry({ coords: null, gpsEnabled: false, setGpsEnabled });
      fireEvent.click(screen.getByText("Add component"));
      fillRequired();
      fireEvent.click(screen.getByText("Save"));

      // Приёмник включается сам, а не спрашивает у человека у скважины.
      await waitFor(() => expect(setGpsEnabled).toHaveBeenCalledWith(true));
      expect(registry.current.addComponent).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(16_000);
      await waitFor(() =>
        expect(registry.current.addComponent).toHaveBeenCalledTimes(1),
      );
      expect(
        screen.getByText(/без координат|without coordinates/),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
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

    // Opening a card lands on what it says; editing is a step further in —
    // и остаётся в этом же листе, как у утечки, а не открывает мастер заново.
    fireEvent.click(screen.getByText("Задвижка"));
    const sheet = screen.getByRole("dialog", { name: "Component card" });
    fireEvent.click(screen.getByText("Edit"));

    expect(screen.queryByText("Next →")).toBeNull();
    expect(sheet).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Локация"), {
      target: { value: "Скважина 22" },
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(registry.current.updateComponent).toHaveBeenCalledWith(
        "a",
        expect.objectContaining({ location: "Скважина 22" }),
      ),
    );

    // Лист остаётся открытым на сохранённом и уже показывает дописанную
    // строку истории: правка редко бывает одна.
    fireEvent.click(screen.getByText("History"));
    expect(screen.getByText("Edited")).toBeTruthy();
    expect(screen.getByText("Скважина 22")).toBeTruthy();
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

  it("shows what the previous card said, greyed out, in the empty fields", () => {
    // Обход однообразен, и быстрее всего сказать «здесь так же», увидев, что
    // было в прошлый раз. Написанным это не становится: подсказка исчезает,
    // как только в поле что-то печатают.
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

    expect(screen.getByLabelText(/Номер на схеме/).placeholder).toBe("PG");
    // Чего предыдущая карточка не сказала, о том и подсказывать нечем —
    // остаётся пример из локали, объясняющий форму ответа.
    expect(screen.getByLabelText(/Подразделение/).placeholder).toBe(
      "e.g. Messoyakha gas plant",
    );
  });

  it("offers nothing from a neighbouring card while editing a saved one", () => {
    // Подсказка — про заведение следующей карточки. В правке серым стояло бы
    // значение соседней, которое легко принять за уже сохранённое здесь.
    registry.current = makeRegistry({
      components: [
        { id: "c1", component_uid: "14", component: "Задвижка", history: [] },
      ],
      lastComponent: { id: "prev", component_uid: "6", scheme_tag: "PG" },
    });
    renderRegistry();
    fireEvent.click(screen.getByText("Задвижка"));
    fireEvent.click(screen.getByText("Edit"));

    expect(
      screen.getByLabelText("Инвентаризационный номер на схеме").placeholder,
    ).not.toBe("PG");
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

describe("the microphone in the card", () => {
  beforeEach(() => {
    voiceControl.pending = null;
    voiceControl.options = null;
  });

  it("hands the registry's own dictionary to the recogniser", () => {
    // Раньше кнопка запускала распознавание со словарём утечки, и писать
    // распознанному в карточке было некуда — оно просто пропадало.
    registry.current = makeRegistry();
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(voiceControl.options.voice).toEqual({
      outputFields: ["component"],
      synonymsFields: ["component"],
    });
    expect(voiceControl.options.steps).toBeTruthy();
  });

  it("offers what was heard for confirmation before writing it", () => {
    registry.current = makeRegistry();
    voiceControl.pending = { component: "Задвижка" };
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(screen.getByText("Задвижка")).toBeTruthy();
  });

  it("hides the microphone when the project type gives the registry no voice", () => {
    registry.current = makeRegistry();
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));
    expect(screen.getByRole("button", { name: "Voice input" })).toBeTruthy();

    cleanup();
    registry.current = makeRegistry({ voice: null });
    renderRegistry();
    fireEvent.click(screen.getByText("Add component"));

    expect(screen.queryByRole("button", { name: "Voice input" })).toBeNull();
  });
});

describe("the card in full", () => {
  const walked = {
    id: "a",
    component_uid: "7",
    component: "Задвижка",
    scheme_tag: "ЗД32",
    lat: 38.4,
    lng: 66.1,
    history: [
      {
        action: "component_edited",
        date: "2026-01-02T00:00:00.000Z",
        user: "Мухиддин",
        changes: [{ key: "scheme_tag", from: "ЗД31", to: "ЗД32" }],
      },
    ],
  };

  function openCard(component = walked) {
    registry.current = makeRegistry({ components: [component] });
    renderRegistry();
    fireEvent.click(screen.getByText("Задвижка"));
  }

  it("keeps the coordinates off the passport list and on their own tab", () => {
    openCard();

    // Номер на схеме и широта отвечают на разные вопросы; одним списком
    // нужное находилось только прокруткой.
    expect(screen.getAllByText("ЗД32").length).toBeGreaterThan(0);
    expect(screen.queryByText("38.4")).toBeNull();

    fireEvent.click(screen.getByText("Coordinates"));
    expect(screen.getByText("38.4")).toBeTruthy();
    expect(screen.getByText("66.1")).toBeTruthy();
  });

  it("says outright when a card never got a fix", () => {
    openCard({ ...walked, lat: undefined, lng: undefined });

    fireEvent.click(screen.getByText("Coordinates"));
    expect(screen.getByText(/not on the map/)).toBeTruthy();
  });

  it("shows what a change was, not which field it touched", () => {
    // Раньше в истории стояло имя поля из кода — «scheme_tag», — и запись
    // сообщала, что что-то менялось, но не что именно.
    openCard();

    fireEvent.click(screen.getByText("History"));
    expect(screen.getByText("ЗД31")).toBeTruthy();
    expect(screen.getAllByText("ЗД32").length).toBeGreaterThan(0);
    expect(screen.queryByText("scheme_tag")).toBeNull();
  });
});

describe("working with a set of cards at once", () => {
  function withCards() {
    registry.current = makeRegistry({
      components: [
        { id: "a", component_uid: "1", component: "Задвижка" },
        { id: "b", component_uid: "2", component: "Труба" },
      ],
    });
    renderRegistry();
  }

  it("sorts by the number the walker assigned, not by when it was typed", () => {
    // Обход идут по номерам, и «9 после 1» вместо «9 после 8» сбивает поиск
    // карточки глазами.
    withCards();

    expect(screen.getByText("by number ↑")).toBeTruthy();
    fireEvent.click(screen.getByText("by number ↑"));
    expect(screen.getByText("by number ↓")).toBeTruthy();
  });

  it("takes the whole shown list and gives it back", () => {
    withCards();

    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("2 selected of 2")).toBeTruthy();

    fireEvent.click(screen.getByText("Clear selection"));
    expect(screen.queryByText("2 selected of 2")).toBeNull();
  });

  it("records one inspection per card when a set is walked at once", async () => {
    // Подряд стоящее железо осматривают разом и находят в одном состоянии.
    // Запись всё равно идёт по одной: у каждой карточки своя подпись и своя
    // отметка о времени.
    withCards();

    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByText("Change state"));
    fireEvent.click(screen.getByText("В работе"));

    await waitFor(() =>
      expect(registry.current.updateComponent).toHaveBeenCalledTimes(2),
    );
    expect(registry.current.updateComponent.mock.calls[0][1]).toMatchObject({
      component_status: "В работе",
    });
    // Выбор снимается сам: набранный список — это одно действие, а не режим.
    expect(screen.queryByText("2 selected of 2")).toBeNull();
  });
});

describe("что видно в списке и по чему он отбирается", () => {
  it("подписывает карточку тем, когда её завели", () => {
    // Как у утечки: по списку видно, докуда дошёл обход сегодня, а не только
    // что в нём вообще есть.
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component: "Задвижка",
          date: new Date().toISOString(),
        },
      ],
    });
    renderRegistry();

    expect(screen.getByText(/назад|ago|сейчас|now/i)).toBeTruthy();
  });

  it("предлагает состояние, которого нет в словаре", () => {
    // Поле открытое, и карточка с дописанным от руки состоянием раньше не
    // находилась вовсе — кнопки для него не существовало.
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component: "Задвижка",
          component_status: "Законсервирован до весны",
        },
      ],
    });
    renderRegistry();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    // Состояние стоит и на карточке, и кнопкой в панели — берём кнопку.
    fireEvent.click(
      screen.getAllByRole("button", { name: /Законсервирован до весны/ })[0],
    );

    expect(screen.getByText("Задвижка")).toBeTruthy();
  });

  it("отбирает по кругу вокруг стоящего человека", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "near",
          component_uid: "1",
          component: "Задвижка",
          lat: 38.4,
          lng: 66.1,
        },
        {
          id: "far",
          component_uid: "2",
          component: "Труба",
          lat: 39.4,
          lng: 67.1,
        },
      ],
    });
    renderRegistry({ coords: { lat: 38.4, lng: 66.1 } });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByText(/Near me/));

    expect(screen.getByText("Задвижка")).toBeTruthy();
    expect(screen.queryByText("Труба")).toBeNull();
  });

  it("подписывает карточку осмотром, а не заведением", () => {
    // Карточку заводят однажды, а обходят её потом годами: в списке
    // спрашивают «когда здесь были», а не «когда завели».
    const now = Date.now();
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component: "Задвижка",
          date: new Date(now - 86400e3 * 5).toISOString(),
          inspected_at: new Date(now - 3600e3).toISOString(),
        },
      ],
    });
    renderRegistry();

    expect(screen.getByText("1 hr. ago")).toBeTruthy();
  });

  it("ставит расстояние на карточку вместе с кругом", () => {
    // Как в списке утечек: значок ставит сам отбор по близости. Спрашивают о
    // расстоянии тогда же, когда его включают.
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component: "Задвижка",
          lat: 38.4,
          lng: 66.1,
        },
      ],
    });
    renderRegistry({ coords: { lat: 38.4, lng: 66.101 } });

    // Значок с числом — на карточке; такой же без числа стоит на тумблере.
    const badges = () =>
      screen.queryAllByText((_, node) =>
        /^📌\s*\d+/.test(node?.textContent ?? ""),
      );
    expect(badges()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByText(/Near me/));

    expect(badges().length).toBeGreaterThan(0);
  });

  it("не обещает расстояния без фикса", () => {
    registry.current = makeRegistry({
      components: [
        {
          id: "a",
          component_uid: "1",
          component: "Задвижка",
          lat: 38.4,
          lng: 66.1,
        },
      ],
    });
    renderRegistry({ coords: null });

    expect(screen.queryByText(/📌/)).toBeNull();
  });

  it("не предлагает круг, когда мерить не от чего", () => {
    registry.current = makeRegistry({
      components: [{ id: "a", component_uid: "1", component: "Задвижка" }],
    });
    renderRegistry({ coords: null });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByText(/Near me/)).toBeNull();
  });
});

/*
 * Черновик карточки.
 *
 * Обход прерывают постоянно, а карточка заполняется в четыре шага у железа:
 * потерять её на полпути значит идти к этому железу второй раз. Ключ у неё
 * свой — начатая карточка не должна стирать начатую утечку.
 */
describe("черновик карточки компонента", () => {
  const DRAFT_KEY = "app:p1:component_draft_v1";

  beforeEach(() => {
    localStorage.clear();
    registry.current = makeRegistry();
  });

  function storeDraft(form, step = 1) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ projectId: "p1", form, step, savedAt: Date.now() }),
    );
  }

  it("сохраняет заполненное, пока карточку заводят", async () => {
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    fireEvent.change(screen.getByLabelText(/Индивидуальный номер/), {
      target: { value: "9001" },
    });

    await waitFor(
      () => {
        const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
        expect(String(stored?.form?.component_uid)).toBe("9001");
      },
      { timeout: 3000 },
    );
  });

  it("предлагает восстановить незаконченную карточку", async () => {
    storeDraft({ component_uid: "9001", component: "Задвижка" });
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    expect(await screen.findByText(/unfinished card/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByLabelText(/Индивидуальный номер/).value).toBe("9001");
    expect(screen.queryByText(/unfinished card/i)).toBeNull();
  });

  // Ради этого всё и делается: снимок в localStorage не положишь целиком, в
  // черновик уходит только предпросмотр — и он должен считаться снимком.
  it("возвращает выбранное фото и даёт сохранить карточку", async () => {
    storeDraft(
      {
        component_uid: "9001",
        component: "Задвижка",
        photo: { src: "data:image/png;base64,iVBORw0KGgo=" },
      },
      4,
    );
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    expect(screen.getByText("photo attached")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Save$/ }));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalled(),
    );
  });

  it("забывает черновик, если его отвергли", async () => {
    storeDraft({ component_uid: "9001" });
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByLabelText(/Индивидуальный номер/).value).toBe("");
  });

  // Иначе черновик предлагался бы поверх уже заведённой карточки.
  it("снимает черновик после сохранения", async () => {
    storeDraft(
      {
        component_uid: "9001",
        component: "Задвижка",
        photo: { src: "data:image/png;base64,iVBORw0KGgo=" },
      },
      4,
    );
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    fireEvent.click(screen.getByRole("button", { name: /Save$/ }));

    await waitFor(() =>
      expect(registry.current.addComponent).toHaveBeenCalled(),
    );
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  // Только что открытая форма уже несёт координаты — они штампуются при
  // открытии. Считать это началом работы значит предлагать восстановить пустое.
  it("не считает начатой карточку с одними координатами", async () => {
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
