import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalDialog({
  open = true,
  onClose,
  closeDisabled = false,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);

  closeRef.current = onClose;
  disabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const target = dialog?.querySelector(FOCUSABLE) ?? dialog;
      target?.focus();
    });

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape" && !disabledRef.current) {
        event.preventDefault();
        closeRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  return dialogRef;
}
