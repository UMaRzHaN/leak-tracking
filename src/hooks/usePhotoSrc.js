import { useEffect, useState } from "react";
import { isNative } from "@/utils/platform";
import { getPhotoSrc } from "./photoService";
import { useIndexedDB } from "./useIndexedDB";
import { logger } from "@/utils/logger";

export function usePhotoSrc(path, version = 0) {
  const [src, setSrc] = useState(/** @type {string|null} */ (null));
  const { ready, getPhoto } = useIndexedDB();

  useEffect(() => {
    let alive = true;
    let blobUrl = /** @type {string|null} */ (null);

    const cleanup = () => {
      alive = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
    };

    if (!path) {
      setSrc(null);
      return cleanup;
    }

    // Путь к снимку — строка. Не строка приходит только из испорченной записи:
    // импорт Excel оставлял у событий сам Blob вместо пути, а на телефоне Blob
    // в JSON становится `{}`. Одна такая запись роняла весь экран на
    // `path.startsWith`. Blob ещё можно показать, остальное — нет; оба случая
    // уходят в диагностику, иначе порча в данных осталась бы незамеченной.
    if (typeof path !== "string") {
      logger.warn(
        "[usePhotoSrc] photo path is not a string",
        Object.prototype.toString.call(path),
      );
      if (path instanceof Blob) {
        blobUrl = URL.createObjectURL(path);
        setSrc(blobUrl);
      } else {
        setSrc(null);
      }
      return cleanup;
    }

    const withVersion = (url) =>
      url.startsWith("data:") || url.startsWith("blob:")
        ? url
        : `${url}?v=${version}`;

    /* =======================
       🌐 WEB
    ======================= */
    if (!isNative) {
      if (path.startsWith("idb://")) {
        if (!ready) {
          setSrc(null);
          return cleanup;
        }

        getPhoto(path.replace("idb://", ""))
          .then((data) => {
            if (!alive) return;
            if (!data) {
              setSrc(null);
              return;
            }

            if (data instanceof Blob) {
              // New storage: Blob → Object URL (GC'd via cleanup)
              blobUrl = URL.createObjectURL(data);
              setSrc(blobUrl);
            } else {
              // Legacy storage: data URI string — use directly
              setSrc(withVersion(data));
            }
          })
          .catch(() => {
            if (alive) setSrc(null);
          });

        return cleanup;
      }

      if (path.startsWith("data:")) {
        setSrc(withVersion(path));
        return cleanup;
      }

      setSrc(withVersion(path));
      return cleanup;
    }

    /* =======================
       📱 NATIVE
       Поддерживаем как новый формат data:// так и старый Documents/
    ======================= */
    getPhotoSrc(path)
      .then((result) => {
        if (!alive) return;
        setSrc(result ? withVersion(result) : null);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });

    return cleanup;
  }, [path, version, ready, getPhoto]);

  return src;
}
