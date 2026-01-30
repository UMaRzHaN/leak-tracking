import { useCallback, useMemo, useState } from "react";
import { normalizeNumber } from "../../../utils/normalize/normalizeNumber";
import { useProjectConfig } from "../../../app/settings/useProjectConfig";

export function useLeakForm() {
  const projectConfig = useProjectConfig();

  const NUMBER_FIELDS = useMemo(
    () => projectConfig?.system?.numeric ?? [],
    [projectConfig],
  );
  const [form, setForm] = useState({
    leak_id: "",
    photo: null, // 🔑 ЕДИНСТВЕННОЕ поле для фото
  });

  const [errors, setErrors] = useState({});
  const clearForm = useCallback(() => {
    setForm({
      leak_id: "",
      photo: null,
    });
  }, []);
  const handle = (key, value) => {
    const finalValue = NUMBER_FIELDS.includes(key)
      ? normalizeNumber(value)
      : value;

    setForm((prev) => ({
      ...prev,
      [key]: finalValue,
    }));

    setErrors((prev) => ({
      ...prev,
      [key]: "",
    }));
  };

  return { form, setForm, errors, setErrors, handle, clearForm };
}
