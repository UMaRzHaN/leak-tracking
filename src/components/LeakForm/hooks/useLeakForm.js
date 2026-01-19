import { useState } from "react";
import { normalizeNumber } from "../../../utils/normalizeNumber";
import { NUMBER_FIELDS } from "../constants";

export function useLeakForm() {
  const [form, setForm] = useState({
    leak_id: "",
    photoPreview: null,
    _newPhoto: null,
  });
  const [errors, setErrors] = useState({});

  const handle = (key, value) => {
    const finalValue = NUMBER_FIELDS.includes(key)
      ? normalizeNumber(value)
      : value;

    setForm((p) => ({ ...p, [key]: finalValue }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  return { form, setForm, errors, setErrors, handle };
}
