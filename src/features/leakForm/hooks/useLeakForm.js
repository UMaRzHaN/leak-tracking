import { useCallback, useMemo, useState } from "react";
import { parseNumericInput } from "@/utils/normalize/parseNumericInput";
import { NUMERIC_FIELD_KEY_SET } from "@/configs/shared/fieldRegistry";

export function useLeakForm() {
  // Из лёгкого списка, а не из `system.numeric` конфига типа. Провайдер этой
  // формы обёрнут вокруг всего приложения, и обращение к конфигу затаскивало
  // на первый экран поля, словари и шаги всех трёх типов проекта. Набор
  // числовых полей у типов общий, и за его общностью следит тест.
  const NUMBER_KEYS = NUMERIC_FIELD_KEY_SET;

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
    setErrors({});
  }, []);

  const handle = useCallback(
    (key, value) => {
      const finalValue = NUMBER_KEYS.has(key)
        ? parseNumericInput(value)
        : value;

      setForm((prev) => ({ ...prev, [key]: finalValue }));
      setErrors((prev) => ({ ...prev, [key]: "" }));
    },
    [NUMBER_KEYS],
  );

  return useMemo(
    () => ({ form, setForm, errors, setErrors, handle, clearForm }),
    [form, errors, handle, clearForm],
  );
}
