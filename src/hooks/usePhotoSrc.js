import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getPhotoSrc } from "../services/photoService";
import { useIndexedDB } from "./useIndexedDB";

export function usePhotoSrc(path, version = 0) {
  const [src, setSrc] = useState(null);
  const { ready, getPhoto } = useIndexedDB();

  useEffect(() => {
    let alive = true;
    const currentPath = path;

    if (!path) {
      setSrc(null);
      return;
    }

    const withVersion = (url) => {
      if (url.startsWith("data:") || url.startsWith("blob:")) {
        return url;
      }
      return `${url}?v=${version}`;
    };

    /* =======================
       🌐 WEB
    ======================= */
    if (!Capacitor.isNativePlatform()) {
      // IndexedDB
      if (path.startsWith("idb://")) {
        if (!ready) {
          setSrc(null);
          return;
        }

        const photoId = path.replace("idb://", "");

        getPhoto(photoId).then((photoData) => {
          if (!alive || currentPath !== path) return;
          setSrc(photoData ? withVersion(photoData) : null);
        });

        return;
      }

      // data: URI
      if (path.startsWith("data:")) {
        setSrc(withVersion(path));
        return;
      }

      // invalid WEB path
      if (path.startsWith("Documents/")) {
        console.warn("WEB: invalid photo path", path);
        setSrc(null);
        return;
      }

      setSrc(withVersion(path));
      return;
    }

    /* =======================
       📱 NATIVE
    ======================= */
    getPhotoSrc(path).then((result) => {
      if (!alive || currentPath !== path) return;
      setSrc(result ? withVersion(result) : null);
    });

    return () => {
      alive = false;
    };
  }, [path, version, ready, getPhoto]);

  return src;
}
