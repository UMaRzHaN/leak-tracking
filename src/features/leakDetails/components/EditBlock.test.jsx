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

const EditBlock = (await import("./EditBlock")).default;

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

  it("на незнакомой вкладке не рисует ничего", () => {
    const { container } = open("нет такой");

    expect(container).toBeEmptyDOMElement();
  });
});
