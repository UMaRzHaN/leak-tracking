import { useState } from "react";
import { normalizeNumber } from "../../../utils/normalizeNumber";
import { NUMBER_FIELDS } from "../constants";

export function useLeakForm() {
  const [form, setForm] = useState({
    leak_id: "",
    photo: null, // 🔑 ЕДИНСТВЕННОЕ поле для фото
  });

  const [errors, setErrors] = useState({});

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

  return { form, setForm, errors, setErrors, handle };
}
