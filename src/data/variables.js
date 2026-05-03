// Типы газов и их плотности (кг/м³)
export const GAS_TYPES = {
  methane: { label: "Метан (CH₄)", density: 0.000716 },
  ethane: { label: "Этан (C₂H₆)", density: 0.001355 },
  propane: { label: "Пропан (C₃H₈)", density: 0.002019 },
  butane: { label: "Бутан (C₄H₁₀)", density: 0.002703 },
};

export const EQUIPMENT_TYPES = {
  "GFM 2.0": { label: "GFM 2.0", uncertainty: 0.05, serial_number: null },
  "GFM 3.0": { label: "GFM 3.0", uncertainty: 0.05, serial_number: null },
  "Розовый мешок": {
    label: "Розовый мешок",
    uncertainty: 0.1,
    serial_number: 1,
  },
};

export const VAR_DEFAULTS = Object.freeze({
  gasType: "methane",
  equipmentType: "GFM 2.0",
  uncertainty: EQUIPMENT_TYPES["GFM 2.0"].uncertainty,
  density: GAS_TYPES.methane.density,
  percentage_gas_to_flare: 100,
  percentage_gas_to_utilization: 0,
  GWP_CH4: 28,
  GWP_CH4_Minus: 25.25,
  serial_number: EQUIPMENT_TYPES["GFM 2.0"].serial_number,
});
