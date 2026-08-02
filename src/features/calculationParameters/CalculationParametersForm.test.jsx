import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import CalculationParametersForm from "./CalculationParametersForm";

const texts = {
  gasToFlare: "Gas to flare",
  flare: "Flare",
  utilization: "Utilization",
  gasContent: "Gas content",
  current: "Current",
  equipmentType: "Equipment type",
  uncertainty: "Uncertainty",
  serialNumber: "Serial number",
  serialNumberRequired: "Serial number is required",
  operatingMode: "Operating mode",
  operatingModeDays: "days",
  gasType: "Gas type",
  equipmentOptions: {
    gfm20: "GFM 2.0",
    gfm30: "GFM 3.0",
    pinkBag: "Pink Bag",
  },
  gasOptions: {
    methane: "Methane",
    ethane: "Ethane",
    propane: "Propane",
    butane: "Butane",
  },
};

const initialValue = {
  gasType: "methane",
  density: 0.7168,
  equipmentType: "GFM 2.0",
  uncertainty: 5,
  serial_number: null,
  percentage_gas_to_flare: 0,
  percentage_gas_to_utilization: 100,
  gasPercentage: 100,
  Operating_mode: 365,
  GWP: 28,
  GWP_Minus: 25.25,
};

function Harness({ submitted = false }) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <CalculationParametersForm
        value={value}
        setValue={setValue}
        texts={texts}
        submitted={submitted}
        idPrefix="test-calc"
      />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  );
}

function state() {
  return JSON.parse(screen.getByTestId("state").textContent);
}

describe("CalculationParametersForm", () => {
  it("keeps flare and utilization shares complementary", () => {
    const { container } = render(<Harness />);
    const flareNumberInput = container.querySelector('input[type="number"]');

    fireEvent.change(flareNumberInput, { target: { value: "35.5" } });

    expect(state().percentage_gas_to_flare).toBe(35.5);
    expect(state().percentage_gas_to_utilization).toBe(64.5);
  });

  it("switches Pink Bag defaults and disables serial editing", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      screen.getByLabelText("Equipment type"),
      "Розовый мешок",
    );

    expect(state().uncertainty).toBe(10);
    expect(state().serial_number).toBe(1);
    expect(screen.getByLabelText(/Serial number/)).toBeDisabled();
  });

  it("shows a validation error for a missing required serial number", () => {
    render(<Harness submitted />);
    expect(screen.getByText("Serial number is required")).toBeInTheDocument();
  });
});
