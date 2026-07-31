(function applyStoredTheme() {
  try {
    var theme = localStorage.getItem("app-theme");
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
})();
