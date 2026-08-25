import { useEffect, useState } from "react";
import { readDeviceStorage } from "@/services/storage/deviceStorage";

/**
 * Свободное место на устройстве для экрана настроек.
 *
 * Отдельным хуком, а не полем в `useSettingsPage`: тот собирает весь экран и
 * стоит в десяти строках от своего потолка. Заводить ради одного числа ещё одну
 * ветку в семисотстрочном модуле — ровно то, против чего этот потолок и стоит.
 *
 * @returns {import("@/services/storage/deviceStorage").DeviceStorage | null}
 * `null`, пока замер не пришёл
 */
export function useDeviceStorage() {
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    readDeviceStorage().then((value) => {
      if (!cancelled) setStorage(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return storage;
}
