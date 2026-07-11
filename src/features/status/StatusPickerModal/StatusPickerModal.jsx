import { STATUS_ORDER, getStatusMeta } from "@/utils/status";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./StatusPickerModal.module.scss";

export default function StatusPickerModal({ current, onSelect, onClose }) {
  const { t } = useLanguage();

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <p className={s.title}>
          {t("statusActions.fallback", { defaultValue: "Change status" })}
        </p>
        <div className={s.options}>
          {STATUS_ORDER.map((status) => {
            const meta = getStatusMeta(status, t);
            const isCurrent = status === current;

            return (
              <button
                key={status}
                className={`${s.option} ${isCurrent ? s.current : ""}`}
                onClick={() => onSelect(status)}
                type="button"
              >
                <span className={s.dot} style={{ background: meta.color }} />
                <span className={s.label}>{meta.label}</span>
                {isCurrent && <span className={s.check}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
