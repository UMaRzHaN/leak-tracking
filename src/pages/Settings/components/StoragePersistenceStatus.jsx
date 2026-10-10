import { useEffect, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { requestPersistentStorage } from "@/services/storage/persistentStorage";
import { isNative } from "@/utils/platform";
import s from "./BackupStatus.module.scss";

/**
 * Может ли браузер стереть проект сам.
 *
 * Без постоянного хранилища браузер вправе вытеснить данные сайта при нехватке
 * места, а Safari — после недели без визитов. Уходят обе копии в IndexedDB
 * разом, и запасная тут не спасает. Приложение просит постоянное хранилище на
 * каждом сохранении, но ответ до сих пор видел только журнал; человеку нужно
 * знать его, чтобы понимать, насколько ему нужен бэкап.
 *
 * На телефоне вопроса нет: данные лежат в файлах приложения.
 */
export default function StoragePersistenceStatus() {
  const { t } = useLanguage();
  const [persisted, setPersisted] = useState(
    /** @type {boolean|null} */ (null),
  );

  useEffect(() => {
    if (isNative) return undefined;
    let cancelled = false;
    requestPersistentStorage()
      .then((result) => {
        if (!cancelled) setPersisted(Boolean(result.persisted));
      })
      .catch(() => {
        if (!cancelled) setPersisted(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isNative || persisted === null) return null;

  return persisted ? (
    <p className={s.backupStatus}>
      {t("settings.storagePersistence.persisted")}
    </p>
  ) : (
    <p className={s.backupStatusOverdue} role="alert">
      {t("settings.storagePersistence.notPersisted")}
    </p>
  );
}
