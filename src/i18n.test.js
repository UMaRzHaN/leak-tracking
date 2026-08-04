import { beforeEach, describe, expect, it, vi } from "vitest";

// Both modules are imported after the reset so they are the same instances
// i18n.js itself uses — the loader keeps track of which languages it has
// already fetched, and a second copy of it would not share that.
async function loadI18n() {
  vi.resetModules();
  const { default: i18n, ready } = await import("./i18n");
  const { loadLanguage } = await import("@/locales/loadLanguage");
  return { i18n, loadLanguage, ready };
}

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads only the saved language", async () => {
    localStorage.setItem("app_language", "en");
    const { i18n, ready } = await loadI18n();
    await ready;

    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
    // The other language stays unfetched — the whole point of the split.
    expect(i18n.hasResourceBundle("ru", "translation")).toBe(false);
    expect(i18n.t("header.settings")).toBe("Settings");
  });

  it("defaults to Russian when nothing is stored", async () => {
    const { i18n, ready } = await loadI18n();
    await ready;

    expect(i18n.language).toBe("ru");
    expect(i18n.t("header.settings")).toBe("Настройки");
  });

  // A stored language the build no longer ships must not leave the interface
  // showing raw keys.
  it("falls back to Russian for an unknown stored language", async () => {
    localStorage.setItem("app_language", "de");
    const { i18n, ready } = await loadI18n();
    await ready;

    expect(i18n.language).toBe("ru");
    expect(i18n.t("header.settings")).toBe("Настройки");
  });

  it("adds a language on demand and reports what became available", async () => {
    const { i18n, loadLanguage, ready } = await loadI18n();
    await ready;
    expect(i18n.hasResourceBundle("en", "translation")).toBe(false);

    await expect(loadLanguage(i18n, "en")).resolves.toBe("en");
    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
  });

  // With one language loaded there is nothing to fall back to, so a missing
  // key has to surface as itself rather than as another language's text.
  it("does not fall back to another language", async () => {
    const { i18n, loadLanguage, ready } = await loadI18n();
    await ready;
    await loadLanguage(i18n, "en");
    await i18n.changeLanguage("en");

    expect(i18n.t("addLeak.stepTitles.location")).not.toBe("");
    expect(i18n.t("nothing.defined.here")).toBe("nothing.defined.here");
  });
});
