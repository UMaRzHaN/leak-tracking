import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getPhotoSrc } from "../services/photoService";

export function usePhotoSrc(path, version = 0) {
  const [src, setSrc] = useState(null);

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
  }, [path, version]);

  return src;
}
