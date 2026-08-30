import { logger } from "@/utils/logger";

/**
 * Открытие базы IndexedDB с двумя обязательствами, которых нет у голого
 * `indexedDB.open`.
 *
 * Обе ситуации — это две вкладки приложения и вышедшее между ними обновление.
 * Старая вкладка держит базу прежней версии, новая просит следующую, и пока
 * первая не отпустит, у второй запрос висит в `blocked`. Без `versionchange`
 * первая не отпускает никогда; без срока ожидания вторая ждёт этого молча — а
 * промис открытия у вызывающих закэширован, поэтому повисает не одно чтение, а
 * все последующие, и человек остаётся на экране загрузки без единой ошибки,
 * которую можно показать.
 *
 * Отсюда два правила: отпустить соединение, когда его ждёт чужое обновление
 * схемы, и не ждать вечно, когда обновления ждём мы.
 *
 * Наличие самого `indexedDB` здесь не проверяется: без него открытие
 * отклоняется, а решать, кэшировать ли такую попытку, — дело вызывающего.
 * Запертый браузер и приватное окно — это «никогда», а не «не сейчас».
 */

/**
 * Сколько ждать чужую вкладку.
 *
 * Это время не на закрытие базы: вкладка с этим кодом отпускает соединение по
 * `versionchange` сразу. Это признак того, что на той стороне держит не наш
 * код — вкладка со старой сборкой, у которой обработчика нет, — и дальше
 * ожидание ничем не кончится.
 */
export const IDB_BLOCKED_TIMEOUT_MS = 5_000;

export class IdbBlockedError extends Error {
  /** @param {string} name */
  constructor(name) {
    super(`IndexedDB database "${name}" is blocked by another connection`);
    this.name = "IdbBlockedError";
    this.code = "IDB_BLOCKED";
  }
}

/**
 * @param {string} name
 * @param {number} version
 * @param {{
 *   upgrade?: (db: IDBDatabase) => void,
 *   onLost?: () => void,
 * }} [handlers] `onLost` зовётся, когда соединение закрылось само или было
 *   закрыто ради чужого обновления: вызывающий держит его в кэше и должен
 *   узнать, что кэш больше не годится.
 * @returns {Promise<IDBDatabase>}
 */
export function openIdbDatabase(name, version, { upgrade, onLost } = {}) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    let abandoned = false;
    let blockedTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);

    const stopWaiting = () => {
      if (blockedTimer == null) return;
      clearTimeout(blockedTimer);
      blockedTimer = null;
    };

    request.onupgradeneeded = () => upgrade?.(request.result);

    request.onblocked = () => {
      logger.warn(
        `[idb] "${name}" is blocked by another open connection; waiting for it to close.`,
      );
      stopWaiting();
      blockedTimer = setTimeout(() => {
        abandoned = true;
        reject(new IdbBlockedError(name));
      }, IDB_BLOCKED_TIMEOUT_MS);
    };

    request.onsuccess = () => {
      stopWaiting();
      const db = request.result;
      if (abandoned) {
        // Чужая вкладка отпустила базу после того, как ждать перестали. Этого
        // соединения уже никто не ждёт, а оставить его открытым — значит
        // заблокировать следующее обновление теперь уже собой.
        //
        // `onLost` здесь не зовётся намеренно: вызывающий сбросил кэш ещё на
        // отказе и мог с тех пор начать новое открытие, которое этот сброс
        // выбросил бы вместе с устаревшим.
        db.close();
        return;
      }
      db.onclose = () => onLost?.();
      db.onversionchange = () => {
        // Схему обновляет соседняя вкладка. Открытое соединение — ровно то,
        // что её держит.
        logger.warn(
          `[idb] closing "${name}": another tab is upgrading the schema.`,
        );
        db.close();
        onLost?.();
      };
      resolve(db);
    };

    request.onerror = () => {
      stopWaiting();
      reject(request.error);
    };
  });
}

/**
 * Открыватель базы, держащий одно соединение на всех.
 *
 * Соединение кэшируется — открывать его на каждое чтение стоило бы дороже
 * самого чтения, — и ровно поэтому кэш обязан сбрасываться: неудачное или
 * закрытое соединение, оставшись в нём, выдавалось бы каждому следующему
 * вызову, и один сбой запирал бы базу до перезагрузки страницы.
 *
 * @param {string} name
 * @param {number} version
 * @param {(db: IDBDatabase) => void} [upgrade]
 * @returns {() => Promise<IDBDatabase|null>} `null` — если IndexedDB нет вовсе
 */
export function createIdbConnection(name, version, upgrade) {
  let connection = /** @type {Promise<IDBDatabase>|null} */ (null);

  return function openDatabase() {
    // Без IndexedDB база не откроется никогда, и кэшировать эту попытку нечем
    // и незачем: запертый браузер и приватное окно — это ответ, а не заминка.
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (connection) return connection;

    let opened = /** @type {Promise<IDBDatabase>|null} */ (null);
    // Только свой промис: пока шло открытие, вызывающий мог начать новое, и
    // сброс устаревшего унёс бы годное соединение.
    const forget = () => {
      if (connection === opened) connection = null;
    };

    opened = openIdbDatabase(name, version, { upgrade, onLost: forget }).catch(
      (error) => {
        forget();
        throw error;
      },
    );
    connection = opened;

    return opened;
  };
}
