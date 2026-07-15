import { useRef, useState } from "react";

export function useSafeSave() {
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const run = async (fn) => {
    if (savingRef.current) return;

    try {
      savingRef.current = true;
      setIsSaving(true);
      return await fn();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return { isSaving, run };
}
