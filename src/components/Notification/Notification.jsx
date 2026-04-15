import { useEffect } from "react";
import s from "./Notification.module.scss";

const ICONS = {
  success: "✓",
  warning: "⚠",
  error: "✕",
  info: "ℹ",
};

/**
 * Toast-уведомление с автоматическим скрытием.
 *
 * Props:
 *  notification  — { type: "success"|"warning"|"error"|"info", message: string } | null
 *  onClose       — function
 *  autoCloseMs   — number (default 3000), 0 = не закрывать автоматически
 */
export default function Notification({ notification, onClose, autoCloseMs = 3000 }) {
  useEffect(() => {
    if (!notification || autoCloseMs === 0) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [notification, onClose, autoCloseMs]);

  if (!notification) return null;

  const { type = "info", message } = notification;

  return (
    <div className={`${s.notification} ${s[type]}`} role="alert">
      <span className={s.icon}>{ICONS[type] ?? "ℹ"}</span>
      <span className={s.message}>{message}</span>
      <button className={s.close} type="button" onClick={onClose} aria-label="Закрыть">
        ✕
      </button>
    </div>
  );
}
