import { appError } from "@/utils/appError";

/**
 * Ждёт, пока активным станет именно тот проект, который только что завели.
 *
 * Проект заводится через контекст, а активным становится следующим рендером —
 * писать в него до этого значит писать в предыдущий. Отсюда ожидание по ref, а
 * не по значению: значение, захваченное замыканием, останется прежним навсегда.
 *
 * Две секунды — это не про скорость устройства, а про признак того, что
 * переключение не случится вовсе; дальше импорт откатывается.
 *
 * @returns {Promise<void>}
 */
export function waitForRefValue(ref, expectedValue, timeoutMs = 2000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (ref.current === expectedValue) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(
          appError(
            "PROJECT_SWITCH_TIMEOUT",
            "Не удалось дождаться переключения проекта",
          ),
        );
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
}
