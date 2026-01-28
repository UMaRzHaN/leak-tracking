// Типы газов и их плотности (кг/м³)
export const GAS_TYPES = {
  methane: { label: "Метан (CH₄)", density: 0.000716 },
  ethane: { label: "Этан (C₂H₆)", density: 0.001355 },
  propane: { label: "Пропан (C₃H₈)", density: 0.002019 },
  butane: { label: "Бутан (C₄H₁₀)", density: 0.002703 },
};

export const EQUIPMENT_TYPES = {
  gfm: { label: "GFM", uncertainty: 0.05 },
  bag: { label: "Розовый мешок", uncertainty: 0.1 },
  flir: { label: "Камера FLIR", uncertainty: 0.3 },
  drone: { label: "Дрон", uncertainty: 0.15 },
};

export let gasType = "methane",
  equipmentType = "gfm",
  uncertainty = EQUIPMENT_TYPES.gfm.uncertainty,
  density = GAS_TYPES.methane.density,
  percentage_gas_to_flare = 1,
  percentage_gas_to_utilization = 100 - percentage_gas_to_flare,
  GWP = 28,
  serial_number = 0;
