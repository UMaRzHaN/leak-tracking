// hooks/usePhotoSrc.js
import { useEffect, useState } from "react";
import { getPhotoSrc } from "../services/photoService";

export function usePhotoSrc(path) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let alive = true;

    if (path) {
      getPhotoSrc(path).then((result) => {
        if (alive) setSrc(result);
      });
    } else {
      setSrc(null);
    }

    return () => {
      alive = false;
    };
  }, [path]);

  return src;
}
