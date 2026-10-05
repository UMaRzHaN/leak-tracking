import s from "@/pages/MainPage/MainPage.module.scss";

/**
 * Строка чипов-счётчиков (5a, 7a): «Все» и по чипу на группу. Повторное
 * нажатие на выбранный чип возвращает «Все». Группы задаёт экран — статусы
 * записи в мониторинге, стадии работ в ремонтах.
 *
 * @param {{
 *   label: string,
 *   all: { key: string, label: string, count: number },
 *   items: Array<{ key: string, label: string, count: number, dot: string }>,
 *   value: string,
 *   onChange: (key: string) => void,
 * }} props
 */
export default function StatusChips({ label, all, items, value, onChange }) {
  return (
    <div className={s.chips} role="group" aria-label={label}>
      <button
        type="button"
        className={`${s.chip} ${value === all.key ? s.chipActive : ""}`}
        aria-pressed={value === all.key}
        onClick={() => onChange(all.key)}
      >
        {all.label}
        <span className={s.chipCount}>{all.count}</span>
      </button>
      {items.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={`${s.chip} ${value === chip.key ? s.chipActive : ""}`}
          aria-pressed={value === chip.key}
          onClick={() => onChange(value === chip.key ? all.key : chip.key)}
        >
          <span className={s.chipDot} style={{ background: chip.dot }} />
          {chip.label}
          <span className={s.chipCount}>{chip.count}</span>
        </button>
      ))}
    </div>
  );
}
