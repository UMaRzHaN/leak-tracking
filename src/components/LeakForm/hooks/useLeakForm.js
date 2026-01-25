import { useState } from "react";
import { normalizeNumber } from "../../../utils/normalizeNumber";
import { SYSTEM_COMPRESSION } from "../../../configs/compression/compressions.config";
const NUMBER_FIELDS = SYSTEM_COMPRESSION.numeric;

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
