import { useLanguage } from "@/app/hooks/useLanguage";
import { STATUS } from "@/utils/status";
import s from "@/pages/MainPage/MainPage.module.scss";

const CHIPS = [
  { key: STATUS.OPEN, label: "mainPage.chips.open", tone: "open" },
  {
    key: STATUS.IN_PROGRESS,
    label: "mainPage.chips.inProgress",
    tone: "progress",
  },
  { key: STATUS.RESOLVED, label: "mainPage.chips.resolved", tone: "resolved" },
];

/**
 * Строка чипов-счётчиков главной мониторинга (5a): бывшие четыре плитки
 * фильтров. Повторное нажатие на выбранный чип возвращает «Все».
 */
export default function StatusChips({ stats, value, all, onChange }) {
  const { t } = useLanguage();
  const counts = {
    [STATUS.OPEN]: stats.open,
    [STATUS.IN_PROGRESS]: stats.inProgress,
    [STATUS.RESOLVED]: stats.resolved,
  };

  return (
    <div
      className={s.chips}
      role="group"
      aria-label={t("mainPage.chips.label")}
    >
      <button
        type="button"
        className={`${s.chip} ${value === all ? s.chipActive : ""}`}
        aria-pressed={value === all}
        onClick={() => onChange(all)}
      >
        {t("mainPage.chips.all")}
        <span className={s.chipCount}>{stats.total}</span>
      </button>
      {CHIPS.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={`${s.chip} ${value === chip.key ? s.chipActive : ""}`}
          aria-pressed={value === chip.key}
          onClick={() => onChange(value === chip.key ? all : chip.key)}
        >
          <span className={`${s.chipDot} ${s[`dot_${chip.tone}`]}`} />
          {t(chip.label)}
          <span className={s.chipCount}>{counts[chip.key]}</span>
        </button>
      ))}
    </div>
  );
}
