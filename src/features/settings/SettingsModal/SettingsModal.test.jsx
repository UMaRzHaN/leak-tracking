import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

// Форма параметров проверяется отдельно; здесь нужен управляемый ввод, чтобы
// править значения и смотреть, что уходит наружу.
vi.mock("@/features/calculationParameters/CalculationParametersForm", () => ({
  default: ({ value, setValue, submitted }) => (
    <div>
      <span data-testid="submitted">{String(submitted)}</span>
      <button
        type="button"
        onClick={() => setValue({ ...value, percentage_gas_to_flare: 70 })}
      >
        set-flare-70
      </button>
      <button
        type="button"
        onClick={() => setValue({ ...value, serial_number: null })}
      >
        clear-serial
      </button>
    </div>
  ),
}));

const SettingsModal = (await import("./SettingsModal")).default;

// Помимо расчётных, у проекта есть и другие переменные — они не должны
// потеряться при сохранении.
const currentVars = {
  equipmentType: "GFM 20",
  serial_number: "SN-1",
  percentage_gas_to_flare: 40,
  percentage_gas_to_utilization: 60,
  gasType: "methane",
  projectName: "Тенгиз",
};

let onSave;
let onClose;

function open(props = {}) {
  const view = render(
    <SettingsModal
      open
      variables={currentVars}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return view;
}

const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("SettingsModal", () => {
  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
    onClose = vi.fn();
  });

  it("закрытый не рисует ничего", () => {
    const { container } = render(
      <SettingsModal
        open={false}
        variables={currentVars}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("не даёт сохранить, пока ничего не изменено", async () => {
    const user = userEvent.setup();
    open();

    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByText("set-flare-70"));
    expect(saveButton()).toBeEnabled();
  });

  it("сводит долю утилизации со сжиганием к сотне", async () => {
    // Инвариант расчёта: газ уходит либо на факел, либо на утилизацию.
    const user = userEvent.setup();
    open();

    await user.click(screen.getByText("set-flare-70"));
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        percentage_gas_to_flare: 70,
        percentage_gas_to_utilization: 30,
      }),
    );
  });

  it("не теряет переменные проекта, которых не касался", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByText("set-flare-70"));
    await user.click(saveButton());

    expect(onSave.mock.calls[0][0]).toMatchObject({ projectName: "Тенгиз" });
  });

  it("требует заводской номер для всего, кроме розового мешка", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByText("clear-serial"));
    await user.click(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    // Форма должна показать, чего не хватает.
    expect(screen.getByTestId("submitted")).toHaveTextContent("true");
  });

  it("розовому мешку заводской номер не нужен", async () => {
    const user = userEvent.setup();
    open({ variables: { ...currentVars, equipmentType: "Розовый мешок" } });

    await user.click(screen.getByText("clear-serial"));
    await user.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("остаётся открытым, если сохранение отказано", async () => {
    // onSave возвращает false, когда данные не приняты, — закрывать нельзя.
    const user = userEvent.setup();
    onSave.mockResolvedValue(false);
    open();

    await user.click(screen.getByText("set-flare-70"));
    await user.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("спрашивает перед уходом с несохранёнными правками", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByText("set-flare-70"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continue editing" }));
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    // true — правки выброшены осознанно, и вызывающий об этом знает.
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("без правок закрывается сразу", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("открывшись заново, берёт значения из проекта, а не прежние", async () => {
    const user = userEvent.setup();
    const { rerender } = open();

    await user.click(screen.getByText("set-flare-70"));
    expect(saveButton()).toBeEnabled();

    rerender(
      <SettingsModal
        open={false}
        variables={currentVars}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    rerender(
      <SettingsModal
        open
        variables={currentVars}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    expect(saveButton()).toBeDisabled();
  });
});
