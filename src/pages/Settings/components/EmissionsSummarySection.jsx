import s from "@/pages/Settings/Settings.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useMemo } from "react";

const fmt = (n) =>
  n >= 1000
    ? `${(n / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс.`
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export default function EmissionsSummarySection({ data }) {
  const { t } = useLanguage();

  const localeTexts = useMemo(
    () => ({
      title: t("emissionsSummary.title"),

      gasLosses: t("emissionsSummary.gasLosses"),
      emissions: t("emissionsSummary.emissions"),
      activeLeaks: t("emissionsSummary.activeLeaks"),

      records: t("emissionsSummary.records"),
      methaneUnit: t("emissionsSummary.methaneUnit"),
      co2Unit: t("emissionsSummary.co2Unit"),
    }),
    [t],
  );
  const active = data.filter((l) => l.status !== "resolved");
  const totalMethane = active.reduce(
    (sum, l) => sum + (Number(l.Total_Annual_Methane_Loss_m3_y) || 0),
    0,
  );
  const totalCO2 = active.reduce(
    (sum, l) => sum + (Number(l.Emissions_t_CO2eq_year) || 0),
    0,
  );

  if (totalMethane === 0 && totalCO2 === 0) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.title}</h2>
      </div>
      <div className={s.emissionsGrid}>
        <div className={s.emissionsCard}>
          <span className={s.emissionsVal}>{fmt(totalMethane)}</span>
          <span className={s.emissionsUnit}>{localeTexts.methaneUnit}</span>
          <span className={s.emissionsLabel}>{localeTexts.gasLosses}</span>
        </div>
        <div className={s.emissionsCard}>
          <span className={s.emissionsVal}>{fmt(totalCO2)}</span>
          <span className={s.emissionsUnit}>{localeTexts.co2Unit}</span>
          <span className={s.emissionsLabel}>{localeTexts.emissions}</span>
        </div>
        <div className={s.emissionsCard}>
          <span className={s.emissionsVal}>{active.length}</span>
          <span className={s.emissionsUnit}>{localeTexts.records}</span>
          <span className={s.emissionsLabel}>{localeTexts.activeLeaks}</span>
        </div>
      </div>
    </section>
  );
}
