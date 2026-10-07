import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});
// Окно расчётных параметров — отдельный экран со своей проверкой; здесь важно
// лишь, что оно открывается и его сохранение доходит до карточки.
vi.mock("@/features/settings/SettingsModal/SettingsModal", () => ({
  default: ({ open, onSave }) =>
    open ? (
      <button type="button" onClick={() => onSave({ P: 42 })}>
        calc-modal
      </button>
    ) : null,
}));
vi.mock("./EditPhotoRow", () => ({
  default: ({ showAfter }) => (
    <div data-testid="photos">{String(showAfter)}</div>
  ),
}));

// Список записанных осмотров и кнопка GPS проверяются у себя; здесь — что
// карточка отдаёт им нужное и правильно принимает ответ.
vi.mock("./RecordEditList", () => ({
  default: ({ kind, edits, setEdits }) => (
    <button type="button" onClick={() => setEdits({ r1: "x" })}>
      records:{kind}:{JSON.stringify(edits)}
    </button>
  ),
}));
vi.mock("@/features/coords/GpsCoordsUpdate", () => ({
  default: ({ onApply }) => (
    <>
      <button type="button" onClick={() => onApply({ lat: 41.1, lng: 69.2 })}>
        gps-apply
      </button>
      <button type="button" onClick={() => onApply(null)}>
        gps-undo
      </button>
    </>
  ),
}));

const EditBlock = (await import("./EditBlock")).default;
const { RECORD_KIND } = await import("@/domain/recordEdits");

const projectConfig = {
  system: {
    fields: [
      { key: "note", label: "Note", multiline: true, editOrder: 4 },
      { key: "lat", label: "Lat", numeric: true, coord: true, editOrder: 3 },
      { key: "pressure", label: "Pressure", numeric: true, editOrder: 2 },
      { key: "component", label: "Component", editOrder: 1 },
      { key: "leak_id", label: "Tag", editable: false, editOrder: 0 },
    ],
  },
};

let setLocalEdit;
let setLocalCalcParams;

function open(activeTab, overrides = {}) {
  return render(
    <EditBlock
      activeTab={activeTab}
      projectConfig={projectConfig}
      localEdit={{ component: "Кран", pressure: "4,0" }}
      setLocalEdit={setLocalEdit}
      localCalcParams={{ P: 1 }}
      setLocalCalcParams={setLocalCalcParams}
      {...overrides}
    />,
  );
}

/** Состояние правится функцией-обновителем — применяем её и смотрим итог. */
const applied = (before = {}) => {
  const [updater] = setLocalEdit.mock.calls.at(-1);
  return updater(before);
};

describe("EditBlock", () => {
  beforeEach(() => {
    setLocalEdit = vi.fn();
    setLocalCalcParams = vi.fn();
  });

  it("даёт править только разрешённые поля, в заданном порядке", () => {
    open("info");

    expect(screen.getByLabelText("Component")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    // Номер бирки правке не подлежит.
    expect(screen.queryByLabelText("Tag")).not.toBeInTheDocument();
    // Порядок задан editOrder: текстовое перед многострочным.
    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toBe(screen.getByLabelText("Component"));
  });

  it("кладёт правку в состояние, не теряя остальных полей", async () => {
    const user = userEvent.setup();
    open("info");

    await user.type(screen.getByDisplayValue("Кран"), "!");

    expect(applied({ component: "Кран", pressure: "4,0" })).toEqual({
      component: "Кран!",
      pressure: "4,0",
    });
  });

  it("разводит координаты и замеры по своим вкладкам", () => {
    open("coords");
    expect(screen.getByDisplayValue("")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("4,0")).not.toBeInTheDocument();

    open("params");
    expect(screen.getByDisplayValue("4,0")).toBeInTheDocument();
  });

  it("говорит прямо, когда править нечего", () => {
    const empty = { system: { fields: [] } };

    open("coords", { projectConfig: empty });
    expect(screen.getByText(/No coordinate fields/i)).toBeInTheDocument();

    open("params", { projectConfig: empty });
    expect(screen.getByText(/No numeric parameters/i)).toBeInTheDocument();

    open("info", { projectConfig: empty });
    expect(screen.getByText(/No editable fields/i)).toBeInTheDocument();
  });

  it("открывает расчётные параметры и доносит сохранённое", async () => {
    const user = userEvent.setup();
    open("params");

    expect(screen.queryByText("calc-modal")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Edit parameters/i }));
    await user.click(screen.getByText("calc-modal"));

    expect(setLocalCalcParams).toHaveBeenCalledWith({ P: 42 });
  });

  it("на вкладке фотографий отдаёт ряд снимков с его условиями", () => {
    open("photo", { showAfter: true });

    expect(screen.getByTestId("photos")).toHaveTextContent("true");
  });

  it("на вкладках осмотров и ремонта отдаёт записи нужного вида", async () => {
    const user = userEvent.setup();
    const setRecordEdits = vi.fn();

    open("monitoring", { recordEdits: { a: 1 }, setRecordEdits });
    expect(
      screen.getByText(`records:${RECORD_KIND.INSPECTION}:{"a":1}`),
    ).toBeInTheDocument();

    open("repairs", { recordEdits: {}, setRecordEdits });
    await user.click(screen.getByText(`records:${RECORD_KIND.REPAIR}:{}`));
    expect(setRecordEdits).toHaveBeenCalledWith({ r1: "x" });
  });

  it("GPS ставит координаты, а «Отменить» возвращает записанные", async () => {
    const user = userEvent.setup();
    open("coords", { originalCoords: { lat: 40, lng: 70 } });

    await user.click(screen.getByText("gps-apply"));
    expect(applied({ note: "n" })).toEqual({
      note: "n",
      lat: 41.1,
      lng: 69.2,
      __gps: { lat: 41.1, lng: 69.2 },
    });

    await user.click(screen.getByText("gps-undo"));
    expect(applied({ lat: 41.1, lng: 69.2, __gps: {} })).toEqual({
      lat: 40,
      lng: 70,
      __gps: null,
    });
  });

  it("без записанных координат «Отменить» очищает поля", async () => {
    const user = userEvent.setup();
    open("coords");

    await user.click(screen.getByText("gps-undo"));
    expect(applied({ lat: 1, lng: 2 })).toEqual({
      lat: "",
      lng: "",
      __gps: null,
    });
  });

  it("правка координаты и замера доходит до состояния", async () => {
    const user = userEvent.setup();

    open("coords", { localEdit: { lat: "41" } });
    await user.type(screen.getByDisplayValue("41"), "5");
    expect(applied({ lat: "41" })).toEqual({ lat: 415 });

    open("params", { localEdit: { pressure: "4" } });
    await user.type(screen.getByDisplayValue("4"), "2");
    expect(applied({ pressure: "4" })).toEqual({ pressure: 42 });
  });

  it("на незнакомой вкладке не рисует ничего", () => {
    const { container } = open("нет такой");

    expect(container).toBeEmptyDOMElement();
  });
});
