export function capitalizeFirst(value) {
  if (typeof value !== "string") return value;

  const text = value.trim();
  if (!text) return text;

  // если начинается с цифры — не трогаем
  if (/^\d/.test(text)) return text;

  // если уже капсом (КШ, ОК, ЗМС)
  if (text === text.toUpperCase()) return text;

  return text.charAt(0).toUpperCase() + text.slice(1);
}
