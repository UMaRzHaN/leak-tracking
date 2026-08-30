/**
 * Объявления для кода вокруг приложения: сидирования, снятия скриншотов,
 * замеров производительности. Проверяются `tsconfig.tools.json`.
 *
 * Отдельно от `src/types/runtime.d.ts` намеренно. Там — окно самого
 * приложения, и каждая запись описывает то, что приложение читает у себя. Здесь
 * — окно страницы, открытой Playwright: `SEED_*` в неё кладёт сам скрипт перед
 * `page.evaluate`, а `Capacitor` появляется только в сборке под телефон, где
 * сидирование идёт в обход веб-хранилища. Приложению эти имена не видны, и
 * смешивать их с его собственными значило бы утверждать обратное.
 */

declare global {
  interface Window {
    /** Сколько записей насидировать; кладётся перед `page.evaluate`. */
    SEED_LEAK_COUNT?: number;
    SEED_COMPONENT_COUNT?: number;
    SEED_CARD_PHOTO_POOL_SIZE?: number;
    SEED_DETAIL_PHOTO_EVERY?: number;
    SEED_RANDOM_SEED?: number;
    SEED_NOW?: number;
    /** Мост Capacitor: есть только в сборке под телефон. */
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: Record<string, any>;
      [key: string]: any;
    };
  }

  interface Performance {
    /**
     * Нестандартное расширение Chrome. Замер размера кучи есть только там, и
     * бюджеты производительности гоняются именно в Chromium.
     */
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

export {};
