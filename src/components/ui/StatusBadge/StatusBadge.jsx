import { getStatusMeta, STATUS } from "@/utils/status";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./StatusBadge.module.scss";

/**
 * Props:
 *  status   - "open" | "in_progress" | "resolved"
 *  size     - "sm" | "md" (default "md")
 *
 * Только показывает статус: вручную его не меняют — это делают проверки
 * мониторинга и ремонта.
 */
export default function StatusBadge({ status = STATUS.OPEN, size = "md" }) {
  const { t } = useLanguage();
  const meta = getStatusMeta(status, t);

  return (
    <span
      className={`${s.badge} ${s[size]}`}
      style={{
        color: meta.color,
        background: meta.bg,
        borderColor: meta.border,
      }}
    >
      {meta.label}
    </span>
  );
}
