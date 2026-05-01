import { STATUS_META, STATUS_ORDER } from "@/utils/status";
import s from "./StatusPickerModal.module.scss";

export default function StatusPickerModal({ current, onSelect, onClose }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <p className={s.title}>Изменить статус</p>
        <div className={s.options}>
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
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
