import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Тема хранится в модуле, а не в состоянии компонента, поэтому каждый тест
 * поднимает модуль заново: иначе первый же прогон оставил бы следующему свой
 * режим и свою подписку.
 */
async function loadUseTheme() {
  vi.resetModules();
  return (await import("@/app/hooks/useTheme")).useTheme;
}

function stubMatchMedia(prefersDark) {
  const listeners = new Set();
  const query = {
    matches: prefersDark,
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
  };
  globalThis.matchMedia = vi.fn(() => query);
  return {
    listenerCount: () => listeners.size,
    change(nextMatches) {
      query.matches = nextMatches;
      for (const listener of [...listeners]) listener({ matches: nextMatches });
    },
  };
}

const themeAttribute = () =>
  document.documentElement.getAttribute("data-theme");
const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

function addThemeColorMeta() {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", "#1976d2");
  document.head.append(meta);
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.querySelector('meta[name="theme-color"]')?.remove();
  delete globalThis.matchMedia;
  vi.restoreAllMocks();
});

describe("useTheme", () => {
  // Ровно то, чего не было: без сохранённого выбора приложение открывалось
  // светлым на телефоне с ночной темой.
  it("следует системной теме, когда выбор не сделан", async () => {
    stubMatchMedia(true);
    const useTheme = await loadUseTheme();

    const { result } = renderHook(() => useTheme());

    expect(result.current.dark).toBe(true);
    expect(themeAttribute()).toBe("dark");
  });

  it("оставляет светлую тему, когда система её и просит", async () => {
    stubMatchMedia(false);
    const useTheme = await loadUseTheme();

    const { result } = renderHook(() => useTheme());

    expect(result.current.dark).toBe(false);
    expect(themeAttribute()).toBe("light");
  });

  // Записи прежних версий — только "light"/"dark", и каждая из них остаётся
  // выбором пользователя, а не следом реализации.
  it("отдаёт предпочтение явному выбору перед системным", async () => {
    localStorage.setItem("app-theme", "light");
    stubMatchMedia(true);
    const useTheme = await loadUseTheme();

    const { result } = renderHook(() => useTheme());

    expect(result.current.dark).toBe(false);
  });

  it("переключается вместе с системой, пока выбор не сделан", async () => {
    const media = stubMatchMedia(false);
    const useTheme = await loadUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => media.change(true));

    expect(result.current.dark).toBe(true);
    expect(themeAttribute()).toBe("dark");
  });

  it("не идёт за системой после явного выбора", async () => {
    localStorage.setItem("app-theme", "light");
    const media = stubMatchMedia(false);
    const useTheme = await loadUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => media.change(true));

    expect(result.current.dark).toBe(false);
    expect(themeAttribute()).toBe("light");
  });

  it("сохраняет явный выбор, когда он расходится с системой", async () => {
    stubMatchMedia(true);
    const useTheme = await loadUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());

    expect(result.current.dark).toBe(false);
    expect(localStorage.getItem("app-theme")).toBe("light");
  });

  // Тумблер двухпозиционный, и «системы» на нём нет. Совпадение с системой —
  // единственный способ вернуться к ней, не заводя третью кнопку.
  it("возвращает управление системе, когда выбор с ней совпал", async () => {
    localStorage.setItem("app-theme", "light");
    const media = stubMatchMedia(true);
    const useTheme = await loadUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());

    expect(result.current.dark).toBe(true);
    expect(localStorage.getItem("app-theme")).toBe("system");

    // И раз выбор снят — снова едет за системой.
    act(() => media.change(false));
    expect(result.current.dark).toBe(false);
  });

  it("ведёт цвет системной строки за темой", async () => {
    addThemeColorMeta();
    const media = stubMatchMedia(false);
    const useTheme = await loadUseTheme();
    renderHook(() => useTheme());

    expect(themeColor()).toBe("#1976d2");

    act(() => media.change(true));
    expect(themeColor()).toBe("#0f172a");
  });

  // Хук зовут из двух мест — из App ради самой подписки и из настроек ради
  // значения. Слушатель системы при этом должен быть один, и сниматься он
  // должен только когда ушёл последний потребитель.
  it("держит одну подписку на всё приложение", async () => {
    const media = stubMatchMedia(false);
    const useTheme = await loadUseTheme();

    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());
    expect(media.listenerCount()).toBe(1);

    first.unmount();
    expect(media.listenerCount()).toBe(1);
    expect(second.result.current.dark).toBe(false);

    second.unmount();
    expect(media.listenerCount()).toBe(0);
  });

  // В окружении без matchMedia — старый WebView, серверный рендер — хук обязан
  // отдать светлую тему, а не упасть.
  it("работает без matchMedia", async () => {
    delete globalThis.matchMedia;
    const useTheme = await loadUseTheme();

    const { result } = renderHook(() => useTheme());

    expect(result.current.dark).toBe(false);
    expect(themeAttribute()).toBe("light");
  });
});
