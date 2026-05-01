import s from "@/pages/Settings/Settings.module.scss";

const fmt = (n) =>
  n >= 1000
    ? `${(n / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс.`
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export default function EmissionsSummarySection({ data }) {
  const active = data.filter((l) => l.status !== "resolved");
  const totalMethane = active.reduce((sum, l) => sum + (Number(l.Total_Annual_Methane_Loss_m3_y) || 0), 0);
  const totalCO2 = active.reduce((sum, l) => sum + (Number(l.Emissions_t_CO2eq_year) || 0), 0);

  if (totalMethane === 0 && totalCO2 === 0) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>Потери проекта (открытые)</h2>
      </div>
      <div className={s.emissionsGrid}>
        <div className={s.emissionsCard}>
          <span className={s.emissionsVal}>{fmt(totalMethane)}</span>
          <span className={s.emissionsUnit}>м³/год</span>
          <span className={s.emissionsLabel}>Потери газа</span>
        </div>
        <div className={s.emissionsCard}>
          <span className={s.emissionsVal}>{fmt(totalCO2)}</span>
          <span className={s.emissionsUnit}>т CO₂-экв/год</span>
          <span className={s.emissionsLabel}>Выбросы</span>
        </div>
        <div className={s.emissionsCard}>
          <span className={s.emissionsVal}>{active.length}</span>
          <span className={s.emissionsUnit}>записей</span>
          <span className={s.emissionsLabel}>Активных утечек</span>
        </div>
      </div>
    </section>
  );
}
