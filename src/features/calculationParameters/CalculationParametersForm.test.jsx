import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalculationParametersForm from "./CalculationParametersForm";

const texts = {
  gasToFlare: "Gas to flare",
  flare: "Flaring",
  utilization: "Utilization",
  gasContent: "Gas content",
  current: "Current",
  equipmentType: "Equipment",
  uncertainty: "Uncertainty",
  serialNumber: "Serial number",
  serialNumberRequired: "Enter the serial number",
  equipmentOptions: { gfm20: "GFM 2.0", gfm30: "GFM 3.0", pinkBag: "Pink bag" },
  operatingMode: "Operating mode",
  operatingModeDays: "days",
  gasType: "Gas",
  gasOptions: {
    methane: "Methane",
    ethane: "Ethane",
    propane: "Propane",
    butane: "Butane",
  },
};

const base = {
  equipmentType: "GFM 2.0",
  uncertainty: 5,
  serial_number: 1234,
  gasType: "methane",
  density: 0.7168,
  percentage_gas_to_flare: 40,
  percentage_gas_to_utilization: 60,
  gasPercentage: 90,
  GWP: 28,
  GWP_Minus: 1,
  Operating_mode: 300,
};

let setValue;

function open(overrides = {}) {
  setValue = vi.fn();
  render(
    <CalculationParametersForm
      value={{ ...base, ...overrides }}
      setValue={setValue}
      texts={texts}
    />,
  );
}

/** Значение правится обновителем — применяем его и смотрим итог. */
const applied = (prev = base) => {
  const [updater] = setValue.mock.calls.at(-1);
  return updater(prev);
};

describe("CalculationParametersForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("переносит долю с факела на утилизацию", () => {
    // Инвариант расчёта: газ уходит либо туда, либо туда.
    open();

    fireEvent.change(screen.getByLabelText(/Gas to flare/), {
      target: { value: "70" },
    });

    expect(applied()).toMatchObject({
      percentage_gas_to_flare: 70,
      percentage_gas_to_utilization: 30,
    });
  });

  it("ползунок не выпускает долю за сотню", () => {
    // Границу здесь держит сам элемент: браузер приводит значение к max, и до
    // проверки в коде дело не доходит. Саму проверку испытывает соседний тест,
    // через числовое поле рядом — оно ничего не обрезает.
    open();

    fireEvent.change(screen.getByLabelText(/Gas to flare/), {
      target: { value: "140" },
    });

    expect(applied()).toMatchObject({
      percentage_gas_to_flare: 100,
      percentage_gas_to_utilization: 0,
    });
  });

  it("отвергает долю за пределами сотни, введённую числом", () => {
    // Рядом с ползунком стоит числовое поле, и оно, в отличие от ползунка,
    // ничего не обрезает — сюда и приходит значение, ради которого в коде
    // стоит проверка.
    open();
    const [, flareNumber] = screen.getAllByRole("spinbutton");

    fireEvent.change(flareNumber, { target: { value: "140" } });
    expect(setValue).toHaveBeenCalled();
    expect(applied()).toBe(base);

    fireEvent.change(flareNumber, { target: { value: "-5" } });
    expect(applied()).toBe(base);
  });

  it("не принимает отрицательный потенциал потепления", () => {
    open();

    fireEvent.change(screen.getByLabelText("GWP"), { target: { value: "-1" } });

    expect(applied()).toBe(base);
  });

  it("подставляет плотность выбранного газа", () => {
    // Плотность не вводят руками — она свойство газа, и разойтись они не должны.
    open();

    fireEvent.change(screen.getByLabelText("Gas"), {
      target: { value: "propane" },
    });

    expect(applied()).toMatchObject({ gasType: "propane", density: 2.019 });
  });

  it("подставляет погрешность и номер вместе с прибором", () => {
    open();

    fireEvent.change(screen.getByLabelText("Equipment"), {
      target: { value: "Розовый мешок" },
    });

    expect(applied()).toMatchObject({
      equipmentType: "Розовый мешок",
      uncertainty: 10,
      serial_number: 1,
    });
  });

  it("держит заводской номер числом, а пустое поле — пустотой", () => {
    open();
    const serial = screen.getByLabelText(/Serial number/);

    fireEvent.change(serial, { target: { value: "77" } });
    expect(applied()).toMatchObject({ serial_number: 77 });

    // Пустое поле — это «номера нет», а не ноль: на нём же держится
    // требование заполнить его перед сохранением.
    fireEvent.change(serial, { target: { value: "" } });
    expect(applied()).toMatchObject({ serial_number: null });
  });

  it("у розового мешка номер не правится вовсе", () => {
    // Он не прибор с серийником, и подставленная единица — часть его описания.
    open({ equipmentType: "Розовый мешок", serial_number: 1 });

    fireEvent.change(screen.getByLabelText(/Serial number/), {
      target: { value: "999" },
    });

    expect(setValue).not.toHaveBeenCalled();
  });

  it("держит режим работы в пределах года и целым", () => {
    open();
    const mode = screen.getByLabelText(/Operating mode/);

    fireEvent.change(mode, { target: { value: "0" } });
    expect(setValue).not.toHaveBeenCalled();

    fireEvent.change(mode, { target: { value: "400" } });
    expect(setValue).not.toHaveBeenCalled();

    fireEvent.change(mode, { target: { value: "182.7" } });
    expect(applied()).toMatchObject({ Operating_mode: 182 });
  });

  it("показывает, чего не хватает, только после попытки сохранить", () => {
    render(
      <CalculationParametersForm
        value={{ ...base, serial_number: null }}
        setValue={vi.fn()}
        texts={texts}
        submitted={false}
      />,
    );
    expect(
      screen.queryByText("Enter the serial number"),
    ).not.toBeInTheDocument();

    render(
      <CalculationParametersForm
        value={{ ...base, serial_number: null }}
        setValue={vi.fn()}
        texts={texts}
        submitted
      />,
    );
    expect(screen.getByText("Enter the serial number")).toBeInTheDocument();
  });
});
