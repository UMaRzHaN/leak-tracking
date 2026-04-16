export function normalizeStationName(value) {
  if (typeof value !== "string") return value;

  let v = value.trim().toLowerCase();

  // 0️⃣ voice: cs / dcs → кс / дкс
  v = v.replace(
    /(^|\s)(cs|dcs)(?=\s|$)/gi,
    (_, pre, t) => `${pre}${t.toLowerCase() === "cs" ? "кс" : "дкс"}`
  );

  // 1️⃣ КС / ДКС + номер + литера (без дефиса)
  v = v.replace(
    /(^|\s)(кс|дкс)\s*(\d+)\s*([а-яa-z]?)(?=\s|$)/gi,
    (_, pre, type, num, lit) =>
      `${pre}${type.toUpperCase()}-${num}${lit.toUpperCase()}`
  );

  // 1️⃣.5 КС-5б / ДКС-12а (с дефисом)
  v = v.replace(
    /(^|\s)(кс|дкс)-(\d+)([а-яa-z]?)(?=\s|$)/gi,
    (_, pre, type, num, lit) =>
      `${pre}${type.toUpperCase()}-${num}${lit.toUpperCase()}`
  );

  // 2️⃣ просто "кс" / "дкс"
  v = v.replace(
    /(^|\s)(кс|дкс)(?=\s|$)/gi,
    (_, pre, t) => `${pre}${t.toUpperCase()}`
  );

  // 3️⃣ чистка пробелов
  v = v.replace(/\s+/g, " ").trim();

  // 4️⃣ капитализация остальных слов
  v = v
    .split(" ")
    .map((w) => {
      if (w === "КС" || w === "ДКС") return w;
      if (/^(КС|ДКС)-\d+[А-Я]?$/.test(w)) return w;
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return v;
}
