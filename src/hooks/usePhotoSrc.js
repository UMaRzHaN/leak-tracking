import { useEffect, useState } from "react";
import { getPhotoSrc } from "../services/photoService";
import { Capacitor } from "@capacitor/core";

export function usePhotoSrc(path, version) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let alive = true;

    if (!path || !Capacitor.isNativePlatform()) {
      setSrc(null);
      return;
    }

    getPhotoSrc(path).then((result) => {
      if (alive && result) {
        setSrc(`${result}?v=${version || 0}`);
      }
    });

    return () => {
      alive = false;
    };
  }, [path, version]);

  return src;
}
