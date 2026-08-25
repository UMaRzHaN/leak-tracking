/**
 * «Файла нет» — по тексту ошибки.
 *
 * Живёт отдельным модулем, потому что спрашивают об этом не только нативные
 * хранилища: реестр схем и реестр компонентов задают тот же вопрос. Пока
 * предикат экспортировался из `legacyNativeLeakStorage.js`, каждый из них ради
 * четырёх строк затаскивал шестьсот — вместе с журналом, снимками и файловой
 * системой. На объём первого экрана это сегодня не влияет: тот же модуль
 * приходит по цепочке `LeakRepository` → `nativeLeakStorage`. Но пока предикат
 * жил там, отложить эту цепочку было нельзя в принципе.
 */
export function isMissingNativeFileError(error) {
  const message = String(error?.message ?? error).toLowerCase();
  return message.includes("exist") || message.includes("not found");
}
