// Типы газов и их плотности (кг/м³)
export const GAS_TYPES = {
  methane: { label: "Метан (CH₄)", density: 0.000716 },
  ethane: { label: "Этан (C₂H₆)", density: 0.001355 },
  propane: { label: "Пропан (C₃H₈)", density: 0.002019 },
  butane: { label: "Бутан (C₄H₁₀)", density: 0.002703 },
};

export let gasType = "methane",
  density = GAS_TYPES.methane.density,
  percentage_gas_to_flare = 1,
  percentage_gas_to_utilization = 100 - percentage_gas_to_flare,
  GWPCH4minus,
  GWPCH4,
  Uncertainty = 5;
export const GWP = 28;
