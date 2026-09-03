import { matchHumanDate } from "@/utils/humanDate";

/**
 * Календарная дата — это день, а не момент, и держится он в UTC.
 *
 * «09.10.2026» не несёт часового пояса: так дату пишут в книге и набирают
 * руками. Собранная местной полночью, она в ISO съезжает на сутки назад в
 * любом поясе западнее Гринвича — и книга, привезённая из другого пояса,
 * начинает показывать вчерашний день. Серийный номер Excel здесь и так
 * считался от `Date.UTC`, так что до сих пор один и тот же день, прочитанный
 * из ячейки-даты и из ячейки-текста, давал моменты, расходящиеся на пояс.
 *
 * Отсюда правило: собирается через `Date.UTC`, читается UTC-геттерами.
 * Написанное человеком возвращается человеку тем же, где бы он ни стоял.
 *
 * Дата со временем — другое дело и живёт по другому правилу. «14:30» в книге
 * — это половина третьего у того, кто её записал, то есть настоящий момент в
 * его поясе, а не отметка UTC. Поэтому `combineDateAndTime` берёт у
 * календарного дня только его число и собирает местный момент: день остаётся
 * написанным, время — местным.
 */
function excelSerialToDate(value) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Number(value) * 24 * 60 * 60 * 1000);
}

function createCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/**
 * Готовый `Date` из ячейки — момент, а не день.
 *
 * Когда спрашивают именно календарный день, момент приводится к здешнему виду.
 * Числа берутся UTC-геттерами, потому что таким день в книгу и попал: выгрузка
 * собирает ячейку-дату через `Date.UTC` (см. `parseTimestamp` в
 * `excelExport/cellValues`), а ExcelJS возвращает тот же момент. Читать его
 * местными часами значит получить западнее Гринвича вчерашний день — и книга,
 * прошедшая круг «выгрузил — импортировал», возвращалась бы с датами на сутки
 * назад.
 */
function toCalendarDate(date) {
  return createCalendarDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function parseDateValue(value, { calendarOnly = false } = {}) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return calendarOnly ? toCalendarDate(value) : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 25000 && value < 80000) return excelSerialToDate(value);
    if (value > 100000000000) return new Date(value);
  }

  const text = String(value).trim();
  if (!text) return null;
  const human = matchHumanDate(text);
  if (human) {
    return createCalendarDate(human.year, human.month, human.day);
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

function pad(value) {
  return String(value).padStart(2, "0");
}

/**
 * Календарный день в том виде, в каком его пишут: ДД.ММ.ГГГГ.
 *
 * Ждёт день, собранный здешними правилами, — из `parseDateValue` с
 * `calendarOnly`. Момент сюда подавать нельзя: у него человеческий день
 * местный, а не UTC, и для него есть `formatMomentDate`.
 */
export function formatDate(date) {
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

/**
 * День настоящего момента — тот, который человек видел на часах.
 *
 * Отметка времени в UTC-геттерах превратилась бы во вчерашний день у всех,
 * кто западнее Гринвича, а речь ровно о том дне, когда запись завели.
 */
export function formatMomentDate(date) {
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

/**
 * Момент записи из календарного дня и часов.
 *
 * День берётся UTC-геттерами, потому что так он и собран, а момент строится
 * местный. Иначе выбор был бы из двух ошибок: местные часы поверх UTC-полуночи
 * уводят дату на соседние сутки, а часы UTC превращают половину третьего дня
 * в половину восьмого вечера.
 *
 * Без часов день тоже становится местной полуночью, а не остаётся UTC. Это
 * ровно то место, где раньше расходились две ветки: со временем в книге запись
 * получала местный момент, без времени — полночь UTC, и дальше обе читались
 * одним и тем же местным `formatMomentDate`. Западнее Гринвича вторая
 * возвращала вчерашний день, и день обхода, написанный в книге, переезжал на
 * сутки назад.
 */
export function combineDateAndTime(date, timeValue) {
  if (!date) return null;
  const time = parseTimeValue(timeValue);

  const combined = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time?.hours ?? 0,
    time?.minutes ?? 0,
    time?.seconds ?? 0,
    0,
  );
  return Number.isFinite(combined.getTime()) ? combined : date;
}
