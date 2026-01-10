import {
  density,
  GWP,
  percentage_gas_to_flare,
  percentage_gas_to_utilization,
} from "../data/variables";
export const calculations = (r) => {
  const leak_speed_kg = r.leak_speed * density;

  const Total_Annual_Methane_Loss_m3_y = r.leak_speed * 525.6;

  const Total_Annual_Methane_Loss_t_y =
    Total_Annual_Methane_Loss_m3_y * 0.0007168;

  const Emissions_t_CO2eq_year =
    Total_Annual_Methane_Loss_t_y *
    (percentage_gas_to_flare * 28 + percentage_gas_to_utilization * 25.25);

  const Emissions_kg_CO2_eq_year = Emissions_t_CO2eq_year * 1000;

  return {
    ...r,
    leak_speed_kg,
    percentage_gas_to_flare,
    percentage_gas_to_utilization,
    Total_Annual_Methane_Loss_m3_y,
    Total_Annual_Methane_Loss_t_y,
    Emissions_t_CO2eq_year,
    Emissions_kg_CO2_eq_year,
    GWP,
  };
};
