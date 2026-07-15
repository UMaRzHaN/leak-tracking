import { useState } from "react";
import s from "../Settings.module.scss";

const SYNC_BUSY_STATUSES = new Set([
  "preparing",
  "scanning",
  "scanningImport",
  "joining",
  "merging",
  "importing",
]);

function getTexts(lang, status) {
  const ru = lang === "ru";
  const statusText = {
    idle: ru ? "Готово" : "Ready",
    preparing: ru ? "Подготовка архива" : "Preparing archive",
    hosting: ru ? "QR активен" : "QR is active",
    scanning: ru ? "Открытие камеры" : "Opening camera",
    scanningImport: ru ? "Открытие камеры" : "Opening camera",
    joining: ru ? "Подключение" : "Connecting",
    merging: ru ? "Объединение данных" : "Merging data",
    importing: ru ? "Импорт базы" : "Importing database",
    complete: ru ? "Завершено" : "Complete",
  };

  return {
    title: ru ? "Локальная синхронизация" : "Local sync",
    status: statusText[status] ?? statusText.idle,
    lead: ru
      ? "Передайте базу напрямую между телефонами в одной Wi-Fi сети или через точку доступа. Интернет не нужен."
      : "Transfer the database directly between phones on the same Wi-Fi network or hotspot. No internet required.",
    hostTitle: ru ? "Этот телефон" : "This phone",
    hostHint: ru
      ? "Создайте QR на устройстве, где уже есть нужная база."
      : "Create a QR code on the device that already has the database.",
    hostIdle: ru ? "Показать QR" : "Show QR",
    hostPreparing: ru ? "Подготовка архива..." : "Preparing archive...",
    stop: ru ? "Остановить сеанс" : "Stop session",
    peerTitle: ru ? "Второй телефон" : "Second phone",
    peerHint: ru
      ? "Сканируйте QR, чтобы синхронизировать текущий проект или импортировать базу как новый проект."
      : "Scan the QR to synchronize the current project or import the database as a new project.",
    scanSync: ru ? "Сканировать и синхронизировать" : "Scan and synchronize",
    scanSyncLoading: ru ? "Открытие камеры..." : "Opening camera...",
    scanImport: ru
      ? "Сканировать и импортировать базу"
      : "Scan and import database",
    scanImportLoading: ru ? "Импорт по QR..." : "Importing by QR...",
    manualTitle: ru ? "Ручное подключение" : "Manual connection",
    manualHint: ru
      ? "Используйте IP, порт и код, если камера недоступна."
      : "Use IP, port and code if the camera is unavailable.",
    address: ru ? "Адрес" : "Address",
    code: ru ? "Код" : "Code",
    port: ru ? "Порт" : "Port",
    connect: ru ? "Подключиться и синхронизировать" : "Connect and synchronize",
    connecting: ru ? "Синхронизация..." : "Synchronizing...",
    overlay: ru
      ? "Наведите камеру на QR-код"
      : "Point the camera at the QR code",
    cancel: ru ? "Отмена" : "Cancel",
    warning: ru
      ? "Используйте только доверенную локальную сеть. Полученный по QR архив проходит те же проверки, что и ZIP backup."
      : "Use a trusted local network only. The QR archive goes through the same checks as a ZIP backup.",
  };
}

export default function LocalSyncSection({ sync, lang }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");

  if (!sync.available) return null;

  const { status, session } = sync.state;
  const busy = SYNC_BUSY_STATUSES.has(status);
  const texts = getTexts(lang, status);
  const isScanning = status === "scanning" || status === "scanningImport";

  return (
    <section className={`${s.section} ${s.localSyncSection}`}>
      {isScanning ? (
        <div className={s.localSyncScannerOverlay} role="dialog">
          <div className={s.localSyncScannerFrame} aria-hidden="true" />
          <p>{texts.overlay}</p>
          <button
            type="button"
            className={s.backupBtn}
            onClick={sync.cancelScan}
          >
            {texts.cancel}
          </button>
        </div>
      ) : null}

      <div className={s.localSyncHero}>
        <div className={s.localSyncHeroText}>
          <span className={s.localSyncEyebrow}>{texts.title}</span>
          <p>{texts.lead}</p>
        </div>
        <span className={s.localSyncStatusPill}>{texts.status}</span>
      </div>

      <div className={s.localSyncBody}>
        <div className={s.localSyncActionGrid}>
          <div className={s.localSyncPanel}>
            <div className={s.localSyncPanelHead}>
              <strong>{texts.hostTitle}</strong>
              <span>{texts.hostHint}</span>
            </div>

            {status === "hosting" && session ? (
              <div className={s.localSyncSession}>
                <span>{texts.address}</span>
                <strong>{`${session.host}:${session.port}`}</strong>
                <span>{texts.code}</span>
                <strong className={s.localSyncCode}>{session.code}</strong>
                {session.qrSvg ? (
                  <div
                    className={s.localSyncQr}
                    aria-label={
                      lang === "ru"
                        ? "QR-код подключения"
                        : "Connection QR code"
                    }
                    dangerouslySetInnerHTML={{ __html: session.qrSvg }}
                  />
                ) : null}
                <button
                  type="button"
                  className={s.backupBtn}
                  onClick={sync.stopHost}
                >
                  {texts.stop}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={s.localSyncPrimaryBtn}
                onClick={sync.startHost}
                disabled={busy}
              >
                {status === "preparing" ? texts.hostPreparing : texts.hostIdle}
              </button>
            )}
          </div>

          <div className={s.localSyncPanel}>
            <div className={s.localSyncPanelHead}>
              <strong>{texts.peerTitle}</strong>
              <span>{texts.peerHint}</span>
            </div>
            <div className={s.localSyncButtonStack}>
              <button
                type="button"
                className={s.backupBtn}
                disabled={busy || status === "hosting"}
                onClick={sync.scanAndJoin}
              >
                {status === "scanning" ? texts.scanSyncLoading : texts.scanSync}
              </button>

              <button
                type="button"
                className={`${s.backupBtn} ${s.restore}`}
                disabled={busy || status === "hosting"}
                onClick={sync.scanAndImport}
              >
                {status === "scanningImport" || status === "importing"
                  ? texts.scanImportLoading
                  : texts.scanImport}
              </button>
            </div>
          </div>
        </div>

        <div className={s.localSyncManualPanel}>
          <div className={s.localSyncPanelHead}>
            <strong>{texts.manualTitle}</strong>
            <span>{texts.manualHint}</span>
          </div>
          <div className={s.localSyncFields}>
            <label>
              <span>IP</span>
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="192.168.43.1"
                inputMode="decimal"
                disabled={busy || status === "hosting"}
              />
            </label>
            <label>
              <span>{texts.port}</span>
              <input
                value={port}
                onChange={(event) =>
                  setPort(event.target.value.replace(/\D/g, ""))
                }
                placeholder="49152"
                inputMode="numeric"
                disabled={busy || status === "hosting"}
              />
            </label>
            <label>
              <span>{texts.code}</span>
              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                inputMode="numeric"
                disabled={busy || status === "hosting"}
              />
            </label>
          </div>
          <button
            type="button"
            className={`${s.backupBtn} ${s.restore}`}
            disabled={
              busy ||
              status === "hosting" ||
              !host.trim() ||
              !port ||
              code.length !== 6
            }
            onClick={() => sync.joinHost({ host, port, code })}
          >
            {status === "joining" || status === "merging"
              ? texts.connecting
              : texts.connect}
          </button>
        </div>

        <p className={s.localSyncWarning}>{texts.warning}</p>
      </div>
    </section>
  );
}
