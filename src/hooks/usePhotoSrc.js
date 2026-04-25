import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getPhotoSrc } from "../services/photoService";
import { useIndexedDB } from "./useIndexedDB";

export function usePhotoSrc(path, version = 0) {
  const [src, setSrc] = useState(null);
  const { ready, getPhoto } = useIndexedDB();

  useEffect(() => {
    let alive = true;
    let blobUrl = null;

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

    const withVersion = (url) =>
      url.startsWith("data:") || url.startsWith("blob:") ? url : `${url}?v=${version}`;

    /* =======================
       🌐 WEB
    ======================= */
    if (!Capacitor.isNativePlatform()) {
      if (path.startsWith("idb://")) {
        if (!ready) { setSrc(null); return cleanup; }

        getPhoto(path.replace("idb://", "")).then((data) => {
          if (!alive) return;
          if (!data) { setSrc(null); return; }

          if (data instanceof Blob) {
            // New storage: Blob → Object URL (GC'd via cleanup)
            blobUrl = URL.createObjectURL(data);
            setSrc(blobUrl);
          } else {
            // Legacy storage: data URI string — use directly
            setSrc(withVersion(data));
          }
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
    getPhotoSrc(path).then((result) => {
      if (!alive) return;
      setSrc(result ? withVersion(result) : null);
    });

    return cleanup;
  }, [path, version, ready, getPhoto]);

  return src;
}
