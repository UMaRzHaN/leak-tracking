(function applyStoredTheme() {
  // Стоит в head синхронно: атрибут должен оказаться на <html> до первой
  // отрисовки, иначе тёмная тема моргает светлым кадром.
  //
  // Сохранённого значения может не быть — это не «светлая тема», а «спроси
  // систему». Раньше эта ветка отсутствовала, и телефон с ночной темой
  // открывал приложение светлым, пока пользователь сам не находил
  // переключатель в настройках.
  var stored = null;
  try {
    stored = localStorage.getItem("app-theme");
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

  var dark;
  if (stored === "dark" || stored === "light") {
    dark = stored === "dark";
  } else {
    dark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Ставится всегда, а не только для тёмной: `useTheme` читает атрибут как
  // текущее состояние, и «нет атрибута» ему пришлось бы толковать отдельно.
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");

  // Тот же список, что в THEME_COLOR внутри useTheme. Начальное значение
  // ставится здесь, потому что цвет системной строки Android читает до того,
  // как смонтируется хоть один компонент.
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0f172a" : "#1976d2");
})();
