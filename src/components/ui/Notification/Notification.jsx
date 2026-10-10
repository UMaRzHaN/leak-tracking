import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const { t } = useLanguage();
  const effectiveAutoCloseMs = notification?.autoCloseMs ?? autoCloseMs;

  /*
   * Обработчик закрытия — в ref, а не в зависимостях таймера: вызывающие
   * передают новую стрелку на каждый рендер, и карта, которая перерисовывается
   * с каждой отметкой GPS раз в секунду, перезапускала таймер раньше, чем он
   * успевал сработать, — тост не закрывался вовсе.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!notification || effectiveAutoCloseMs === 0) return;
    const timer = setTimeout(
      () => onCloseRef.current?.(),
      effectiveAutoCloseMs,
    );
    return () => clearTimeout(timer);
  }, [notification, effectiveAutoCloseMs]);

  if (!notification) return null;

  const { type = "info", message } = notification;

  const toast = (
    <div className={`${s.notification} ${s[type]}`} role="alert">
      <span className={s.icon}>{ICONS[type] ?? "ℹ"}</span>
      <span className={s.message}>{message}</span>
      <button
        className={s.close}
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
      >
        ✕
      </button>
    </div>
  );

  return typeof document === "undefined"
    ? toast
    : createPortal(toast, document.body);
}
