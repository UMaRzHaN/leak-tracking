import { STATUS_ORDER, getStatusMeta } from "@/utils/status";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./StatusPickerModal.module.scss";

export default function StatusPickerModal({ current, onSelect, onClose }) {
  const { t } = useLanguage();
  const options = STATUS_ORDER.filter((status) => status !== current);

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <p className={s.title}>
          {t("statusActions.fallback", { defaultValue: "Change status" })}
        </p>
        <div className={s.options}>
          {options.map((status) => {
            const meta = getStatusMeta(status, t);

            return (
              <button
                key={status}
                className={s.option}
                onClick={() => onSelect(status)}
                type="button"
              >
                <span className={s.dot} style={{ background: meta.color }} />
                <span className={s.label}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
