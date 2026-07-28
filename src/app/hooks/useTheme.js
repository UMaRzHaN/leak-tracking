import { useState, useEffect, useCallback } from "react";
import { getStorageItem, setStorageItem } from "@/utils/safeStorage";

const STORAGE_KEY = "app-theme";

export function useTheme() {
  const [dark, setDark] = useState(
    () => getStorageItem(STORAGE_KEY) === "dark",
  );

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );
    setStorageItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return { dark, toggle };
}
