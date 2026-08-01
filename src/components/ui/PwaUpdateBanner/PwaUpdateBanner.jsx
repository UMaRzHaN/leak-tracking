import { useEffect, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./PwaUpdateBanner.module.scss";

export default function PwaUpdateBanner() {
  const { lang } = useLanguage();
  const [registration, setRegistration] = useState(
    () => window.leakTrackingWaitingServiceWorkerRegistration ?? null,
  );
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    const handleUpdate = (event) => setRegistration(event.detail ?? null);
    window.addEventListener("leak-tracking:update-available", handleUpdate);
    return () =>
      window.removeEventListener(
        "leak-tracking:update-available",
        handleUpdate,
      );
  }, []);

  if (!registration?.waiting) return null;

  const activate = () => {
    if (activating) return;
    setActivating(true);
    window.leakTrackingWaitingServiceWorkerRegistration = null;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  };

  return (
    <aside className={s.banner} role="status" aria-live="polite">
      <span>
        {lang === "ru"
          ? "Доступна новая версия приложения"
          : "A new app version is available"}
      </span>
      <button type="button" onClick={activate} disabled={activating}>
        {activating
          ? lang === "ru"
            ? "Обновление…"
            : "Updating…"
          : lang === "ru"
            ? "Обновить"
            : "Update"}
      </button>
    </aside>
  );
}
