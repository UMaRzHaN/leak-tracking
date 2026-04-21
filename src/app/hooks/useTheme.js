import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "app-theme";

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem(STORAGE_KEY) === "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return { dark, toggle };
}
