// Типы газов и их плотности (кг/м³)
export const GAS_TYPES = {
  methane: { label: "Метан (CH₄)", labelKey: "methane", density: 0.7168 },
  ethane: { label: "Этан (C₂H₆)", labelKey: "ethane", density: 1.355 },
  propane: { label: "Пропан (C₃H₈)", labelKey: "propane", density: 2.019 },
  butane: { label: "Бутан (C₄H₁₀)", labelKey: "butane", density: 2.703 },
};

export const EQUIPMENT_TYPES = {
  "GFM 2.0": {
    label: "GFM 2.0",
    labelKey: "gfm20",
    uncertainty: 5,
    serial_number: null,
  },
  "GFM 3.0": {
    label: "GFM 3.0",
    labelKey: "gfm30",
    uncertainty: 5,
    serial_number: null,
  },
  "Розовый мешок": {
    label: "Розовый мешок",
    labelKey: "pinkBag",
    uncertainty: 10,
    serial_number: 1,
  },
};

export const VAR_DEFAULTS = Object.freeze({
  gasType: "methane",
  equipmentType: "GFM 2.0",
  uncertainty: EQUIPMENT_TYPES["GFM 2.0"].uncertainty,
  density: GAS_TYPES.methane.density,
  percentage_gas_to_flare: 0,
  percentage_gas_to_utilization: 100,
  gasPercentage: 100,
  GWP: 28,
  GWP_Minus: 25.25,
  Operating_mode: 365,
  serial_number: EQUIPMENT_TYPES["GFM 2.0"].serial_number,
});
