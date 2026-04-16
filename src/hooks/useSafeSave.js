import { useState } from "react";

export function useSafeSave() {
  const [isSaving, setIsSaving] = useState(false);

  const run = async (fn) => {
    if (isSaving) return;

    try {
      setIsSaving(true);
      return await fn();
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, run };
}