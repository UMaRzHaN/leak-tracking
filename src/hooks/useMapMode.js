import { useEffect, useState } from "react";

export function useMapMode() {
  const [mode, setMode] = useState("google");

  useEffect(() => {
    const goOnline = () => setMode("google");
    const goOffline = () => setMode("offline");

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { mode, setMode };
}