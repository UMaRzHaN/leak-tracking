/**
 * Общее у двух съёмок руководства — веб-версии и Android: переход по нижней
 * панели и шаг, который при сбое не роняет всю съёмку, а записывает причину.
 * Раньше обе функции жили в каждом скрипте отдельно, строка в строку.
 */

/**
 * Вкладка нижней навигации — по названию, а не по номеру.
 *
 * Номера съехали, как только у Upstream появился «Реестр»: он встал между
 * «Мониторингом» и «Картой», и `nth(4)` начал открывать реестр вместо карты —
 * снимок «27-map» показывал не то, а «28-map-filters» падал, потому что у
 * реестра нет фильтра по мониторингу. Название переживёт и следующую вкладку.
 *
 * Съёмка доходит до английского интерфейса, поэтому имя можно передать
 * регулярным выражением на оба языка: после переключения «Главная»
 * становится «Home».
 */
export async function openTab(page, name) {
  await page
    .getByRole("contentinfo")
    .getByRole("button", {
      name: name instanceof RegExp ? name : new RegExp(name),
    })
    .first()
    .click();
}

/**
 * Шаг съёмки: упавший шаг записывается в `failed`, а съёмка идёт дальше —
 * один несработавший экран не должен стоить всех остальных.
 *
 * @param {string[]} failed
 * @returns {(name: string, fn: () => Promise<void>) => Promise<void>}
 */
export function createStepRunner(failed) {
  return async function step(name, fn) {
    try {
      await fn();
    } catch (error) {
      failed.push(`${name}: ${error.message.split("\n")[0]}`);
      console.log("  ✗", name, "—", error.message.split("\n")[0]);
    }
  };
}
