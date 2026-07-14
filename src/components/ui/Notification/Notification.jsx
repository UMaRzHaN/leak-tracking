import { useEffect } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./Notification.module.scss";

const ICONS = {
  success: "✓",
  warning: "⚠",
  error: "✕",
  info: "ℹ",
};

export default function Notification({
  notification,
  onClose,
  autoCloseMs = 3000,
}) {
  const { lang } = useLanguage();
  const effectiveAutoCloseMs = notification?.autoCloseMs ?? autoCloseMs;

  useEffect(() => {
    if (!notification || effectiveAutoCloseMs === 0) return;
    const timer = setTimeout(onClose, effectiveAutoCloseMs);
    return () => clearTimeout(timer);
  }, [notification, onClose, effectiveAutoCloseMs]);

  if (!notification) return null;

  const { type = "info", message } = notification;

  return (
    <div className={`${s.notification} ${s[type]}`} role="alert">
      <span className={s.icon}>{ICONS[type] ?? "ℹ"}</span>
      <span className={s.message}>{message}</span>
      <button
        className={s.close}
        type="button"
        onClick={onClose}
        aria-label={lang === "ru" ? "Закрыть" : "Close"}
      >
        ✕
      </button>
    </div>
  );
}
