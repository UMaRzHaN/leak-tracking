/**
 * Иконки редизайна — контуры из макетов (design-handoff), обводка 2, круглые
 * концы. Цвет берётся из `currentColor`, поэтому иконка красится там же, где
 * текст кнопки, и не нуждается в своих токенах для тёмной темы.
 *
 * Одна таблица вместо SVG, нарисованного по месту: до редизайна каждая
 * кнопка рисовала свой глиф (⚙, ☰, ◎), и одна и та же «карта» на двух
 * экранах выглядела по-разному.
 */
const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h11" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevronRight: <path d="M9 5.5l6.5 6.5L9 18.5" />,
  folder: (
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  ),
  pin: (
    <>
      <path d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  home: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  map: (
    <>
      <path d="M9 4l6 2 5-2v14l-5 2-6-2-5 2V6l5-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20l.9-3.4 9.1-9.1 2.5 2.5-9.1 9.1L4 20z" />
      <path d="M15.6 5.9l1.6-1.6a1.2 1.2 0 011.7 0l1.4 1.4a1.2 1.2 0 010 1.7l-1.6 1.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </>
  ),
  drop: (
    <>
      <path d="M12 3.5c3.4 4 5.5 6.6 5.5 9.4a5.5 5.5 0 11-11 0c0-2.8 2.1-5.4 5.5-9.4z" />
      <path d="M9.6 13.4a2.6 2.6 0 002.6 2.6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 16.5l4.5-8 3.5 4.5 2.6-3.4 5.4 6.9" />
      <path d="M4 4v16h16" />
    </>
  ),
  clipboard: (
    <>
      <path d="M4.5 6.5h15v13h-15z" />
      <path d="M8.5 4.5h7v4h-7zM8.5 12.5h7M8.5 16h4.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10m0 0l-3.6-3.6M12 14l3.6-3.6" />
      <path d="M4.5 17v2a1 1 0 001 1h13a1 1 0 001-1v-2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20V10m0 0L8.4 13.6M12 10l3.6 3.6" />
      <path d="M4.5 7V5a1 1 0 011-1h13a1 1 0 011 1v2" />
    </>
  ),
  sync: (
    <>
      <path d="M4.5 12a7.5 7.5 0 0112.6-5.5M19.5 12a7.5 7.5 0 01-12.6 5.5" />
      <path d="M17.5 3.5v3.2h-3.2M6.5 20.5v-3.2h3.2" />
    </>
  ),
  swap: <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />,
};

export default function Icon({ name, size = 22, strokeWidth = 1.9 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      {PATHS[name]}
    </svg>
  );
}
