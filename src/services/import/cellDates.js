function excelSerialToDate(value) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Number(value) * 24 * 60 * 60 * 1000);
}

function createCalendarDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function parseDateValue(value, { calendarOnly = false } = {}) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 25000 && value < 80000) return excelSerialToDate(value);
    if (value > 100000000000) return new Date(value);
  }

  const text = String(value).trim();
  if (!text) return null;
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dotted) {
    const year =
      dotted[3].length === 2 ? Number(`20${dotted[3]}`) : Number(dotted[3]);
    return createCalendarDate(year, Number(dotted[2]), Number(dotted[1]));
  }

  if (calendarOnly) {
    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) {
      return createCalendarDate(
        Number(isoDate[1]),
        Number(isoDate[2]),
        Number(isoDate[3]),
      );
    }
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function parseTimeValue(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hours: value.getHours(),
      minutes: value.getMinutes(),
      seconds: value.getSeconds(),
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalSeconds = Math.round(fraction * 24 * 60 * 60) % (24 * 60 * 60);
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

export function formatTime(value) {
  const time = parseTimeValue(value);
  if (!time) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`;
}

export function combineDateAndTime(date, timeValue) {
  if (!date) return null;
  const time = parseTimeValue(timeValue);
  if (!time) return date;

  const combined = new Date(date.getTime());
  combined.setHours(time.hours, time.minutes, time.seconds, 0);
  return combined;
}
