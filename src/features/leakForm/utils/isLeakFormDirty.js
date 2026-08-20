const LEAK_DERIVED_FIELDS = ["detectedBy"];

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === "object") {
    return Object.values(value).some(hasMeaningfulValue);
  }
  return true;
}

/**
 * Есть ли в форме хоть что-то, написанное человеком.
 *
 * Поля, которые приложение проставляет само, не считаются: иначе только что
 * открытая форма выглядит заполненной, и черновик предлагается восстановить
 * там, где восстанавливать нечего. У утечки это имя обходчика, у карточки
 * компонента — координаты, которые штампуются в момент открытия.
 *
 * @param {any} form
 * @param {string[]} [derivedKeys] что проставляет приложение, а не человек
 */
export function isFormDirty(form, derivedKeys = []) {
  if (!form || typeof form !== "object") return false;
  const derived = new Set(derivedKeys);
  return Object.entries(form).some(
    ([key, value]) => !derived.has(key) && hasMeaningfulValue(value),
  );
}

export function isLeakFormDirty(form) {
  return isFormDirty(form, LEAK_DERIVED_FIELDS);
}
