import { useEffect, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./PwaUpdateBanner.module.scss";

export default function PwaUpdateBanner() {
  const { t } = useLanguage();
  const [registration, setRegistration] = useState(
    () =>
      /** @type {ServiceWorkerRegistration|null} */ (
        window.leakTrackingWaitingServiceWorkerRegistration ?? null
      ),
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

  const waiting = registration?.waiting;
  if (!waiting) return null;

  const activate = () => {
    if (activating) return;
    setActivating(true);
    window.leakTrackingWaitingServiceWorkerRegistration = null;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  };

  return (
    <aside className={s.banner} role="status" aria-live="polite">
      <span>{t("pwa.updateAvailable")}</span>
      <button type="button" onClick={activate} disabled={activating}>
        {activating ? t("pwa.updating") : t("pwa.update")}
      </button>
    </aside>
  );
}
