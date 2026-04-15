import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getPhotoSrc } from "../services/photoService";
import { useIndexedDB } from "./useIndexedDB";

export function usePhotoSrc(path, version = 0) {
  const [src, setSrc] = useState(null);
  const { ready, getPhoto } = useIndexedDB();

  useEffect(() => {
    let alive = true;

    if (!path) {
      setSrc(null);
      return;
    }

    const withVersion = (url) =>
      url.startsWith("data:") || url.startsWith("blob:") ? url : `${url}?v=${version}`;

    /* =======================
       🌐 WEB
    ======================= */
    if (!Capacitor.isNativePlatform()) {
      if (path.startsWith("idb://")) {
        if (!ready) { setSrc(null); return; }
        getPhoto(path.replace("idb://", "")).then((data) => {
          if (!alive) return;
          setSrc(data ? withVersion(data) : null);
        });
        return;
      }

      if (path.startsWith("data:")) {
        setSrc(withVersion(path));
        return;
      }

      setSrc(withVersion(path));
      return;
    }

    /* =======================
       📱 NATIVE
       Поддерживаем как новый формат data:// так и старый Documents/
    ======================= */
    getPhotoSrc(path).then((result) => {
      if (!alive) return;
      setSrc(result ? withVersion(result) : null);
    });

    return () => { alive = false; };
  }, [path, version, ready, getPhoto]);

  return src;
}
