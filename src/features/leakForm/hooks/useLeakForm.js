import { useCallback, useMemo, useState } from "react";
import { parseNumericInput } from "@/utils/normalize/parseNumericInput";
import { useProjectConfig } from "@/app/project/hooks/useProjectConfig";

export function useLeakForm() {
  const projectConfig = useProjectConfig();

  // system.numeric is an array of field objects — extract keys into a Set
  const NUMBER_KEYS = useMemo(() => {
    const raw = projectConfig?.system?.numeric ?? [];
    return new Set(raw.map((f) => (typeof f === "string" ? f : f.key)));
  }, [projectConfig]);

  const [form, setForm] = useState({
    leak_id: "",
    photo: null,
  });

  const [errors, setErrors] = useState({});
  const clearForm = useCallback(() => {
    setForm({
      leak_id: "",
      photo: null,
    });
  }, []);

  const handle = useCallback((key, value) => {
    const finalValue = NUMBER_KEYS.has(key)
      ? parseNumericInput(value)
      : value;

    setForm((prev) => ({ ...prev, [key]: finalValue }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }, [NUMBER_KEYS]);

  return useMemo(
    () => ({ form, setForm, errors, setErrors, handle, clearForm }),
    [form, errors, handle, clearForm],
  );
}
