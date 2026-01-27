import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getPhotoSrc } from "../services/photoService";
import { useIndexedDB } from "./useIndexedDB";

export function usePhotoSrc(path, version = 0) {
  const [src, setSrc] = useState(null);
  const { getPhoto } = useIndexedDB();

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

    // 🌐 WEB
    if (!Capacitor.isNativePlatform()) {
      // Если это ссылка на IndexedDB
      if (path.startsWith("idb://")) {
        const photoId = path.replace("idb://", "");
        getPhoto(photoId).then((photoData) => {
          if (!alive || currentPath !== path) return;
          if (photoData) {
            setSrc(withVersion(photoData));
          } else {
            setSrc(null);
          }
        });
        return;
      }
      
      // Если это обычная data: URI
      if (path.startsWith("data:")) {
        setSrc(withVersion(path));
        return;
      }
      
      // Неверный путь для веб версии
      if (path.startsWith("Documents/")) {
        console.warn("WEB: invalid photo path", path);
        setSrc(null);
        return;
      }
      setSrc(withVersion(path));
      return;
    }

    // 📱 NATIVE
    getPhotoSrc(path).then((result) => {
      if (!alive || currentPath !== path) return;

      if (result) {
        setSrc(withVersion(result));
      } else {
        setSrc(null);
      }
    });

    return () => {
      alive = false;
    };
  }, [path, version, getPhoto]);

  return src;
}
