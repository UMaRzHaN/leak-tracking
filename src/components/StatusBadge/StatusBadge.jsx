import { getStatusMeta, STATUS } from "../../utils/status";
import s from "./StatusBadge.module.scss";

/**
 * Props:
 *  status   — "open" | "in_progress" | "resolved"
 *  onClick  — optional, makes it a clickable cycle button
 *  size     — "sm" | "md" (default "md")
 */
export default function StatusBadge({ status = STATUS.OPEN, onClick, size = "md" }) {
  const meta = getStatusMeta(status);

  const style = {
    color: meta.color,
    background: meta.bg,
    borderColor: meta.border,
  };

  if (onClick) {
    return (
      <button
        className={`${s.badge} ${s[size]} ${s.clickable}`}
        style={style}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        title="Нажмите, чтобы изменить статус"
        type="button"
      >
        {meta.label}
      </button>
    );
  }

  return (
    <span className={`${s.badge} ${s[size]}`} style={style}>
      {meta.label}
    </span>
  );
}
