import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
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
    expiresIn: ru ? "Истекает через" : "Expires in",
    transferred: ru ? "Передано устройствам" : "Transferred to devices",
    sessionId: ru ? "ID сеанса" : "Session ID",
    multiDevice: ru
      ? "Разрешить импорт на несколько устройств"
      : "Allow imports to multiple devices",
    multiDeviceHint: ru
      ? "По умолчанию QR закрывается после первой успешной передачи."
      : "By default, the QR closes after the first successful transfer.",
    approvalTitle: ru ? "Разрешить передачу?" : "Allow transfer?",
    approvalSync: ru
      ? "Второе устройство запрашивает двустороннюю синхронизацию."
      : "The second device requests two-way synchronization.",
    approvalImport: ru
      ? "Второе устройство запрашивает копию базы."
      : "The second device requests a copy of the database.",
    peerAddress: ru ? "Устройство" : "Device",
    approve: ru ? "Разрешить" : "Allow",
    reject: ru ? "Отклонить" : "Reject",
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
      ? "Используйте IP, порт, код, ключ безопасности и ID сеанса, если камера недоступна."
      : "Use IP, port, code, security key and session ID if the camera is unavailable.",
    address: ru ? "Адрес" : "Address",
    code: ru ? "Код" : "Code",
    securityKey: ru ? "Ключ безопасности" : "Security key",
    port: ru ? "Порт" : "Port",
    connect: ru ? "Подключиться и синхронизировать" : "Connect and synchronize",
    connecting: ru ? "Синхронизация..." : "Synchronizing...",
    overlay: ru
      ? "Наведите камеру на QR-код"
      : "Point the camera at the QR code",
    cancel: ru ? "Отмена" : "Cancel",
    warning: ru
      ? "Соединение зашифровано TLS. При ручном подключении сверьте ключ безопасности с экраном первого телефона."
      : "The connection is encrypted with TLS. For manual connection, verify the security key against the first phone.",
  };
}

export default function LocalSyncSection({ sync, lang }) {
  const { t } = useLanguage();

  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");
  const [securityKey, setSecurityKey] = useState("");
  const [sessionId, setSessionId] = useState("");

  if (!sync.available) return null;

  const { status, session } = sync.state;
  const busy = SYNC_BUSY_STATUSES.has(status);
  const texts = getTexts(lang, status);
  const isScanning = status === "scanning" || status === "scanningImport";
  const remainingSeconds = session?.remainingSeconds ?? 0;
  const remainingTime = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  return (
    <section className={`${s.section} ${s.localSyncSection}`}>
      {isScanning ? (
        <div
          className={s.localSyncScannerOverlay}
          role="dialog"
          aria-label={texts.overlay}
        >
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

      {sync.approvalRequest ? (
        <div
          className={s.localSyncApprovalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={texts.approvalTitle}
        >
          <div className={s.localSyncApprovalCard}>
            <strong>{texts.approvalTitle}</strong>
            <p>
              {sync.approvalRequest.mode === "sync"
                ? texts.approvalSync
                : texts.approvalImport}
            </p>
            <span>
              {texts.peerAddress}: {sync.approvalRequest.peerAddress || "—"}
            </span>
            <div className={s.localSyncApprovalActions}>
              <button
                type="button"
                className={s.backupBtn}
                onClick={sync.rejectPeer}
              >
                {texts.reject}
              </button>
              <button
                type="button"
                className={s.localSyncPrimaryBtn}
                onClick={sync.approvePeer}
              >
                {texts.approve}
              </button>
            </div>
          </div>
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
                <span>{texts.expiresIn}</span>
                <strong className={s.localSyncTimer}>{remainingTime}</strong>
                <span>{texts.transferred}</span>
                <strong>{session.transferCount ?? 0}</strong>
                <span>{texts.address}</span>
                <strong>{`${session.host}:${session.port}`}</strong>
                <span>{texts.code}</span>
                <strong className={s.localSyncCode}>{session.code}</strong>
                <span>{texts.securityKey}</span>
                <strong className={s.localSyncFingerprint}>
                  {session.fingerprint}
                </strong>
                <span>{texts.sessionId}</span>
                <strong className={s.localSyncSessionId}>
                  {session.sessionId}
                </strong>
                {session.qrSvg ? (
                  <img
                    className={s.localSyncQr}
                    alt={t("settings.connectionQr")}
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                      session.qrSvg,
                    )}`}
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
              <div className={s.localSyncHostOptions}>
                <label className={s.localSyncToggle}>
                  <input
                    type="checkbox"
                    checked={sync.allowMultipleImports}
                    onChange={(event) =>
                      sync.setAllowMultipleImports(event.target.checked)
                    }
                    disabled={busy}
                  />
                  <span>
                    <strong>{texts.multiDevice}</strong>
                    <small>{texts.multiDeviceHint}</small>
                  </span>
                </label>
                <button
                  type="button"
                  className={s.localSyncPrimaryBtn}
                  onClick={sync.startHost}
                  disabled={busy}
                >
                  {status === "preparing"
                    ? texts.hostPreparing
                    : texts.hostIdle}
                </button>
              </div>
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
            <label>
              <span>{texts.securityKey}</span>
              <input
                value={securityKey}
                onChange={(event) =>
                  setSecurityKey(
                    event.target.value
                      .replace(/[^0-9a-f]/gi, "")
                      .toUpperCase()
                      .slice(0, 64),
                  )
                }
                placeholder="64 символа SHA-256"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy || status === "hosting"}
              />
            </label>
            <label className={s.localSyncWideField}>
              <span>{texts.sessionId}</span>
              <input
                value={sessionId}
                onChange={(event) =>
                  setSessionId(
                    event.target.value
                      .replace(/[^0-9a-f-]/gi, "")
                      .toLowerCase()
                      .slice(0, 36),
                  )
                }
                placeholder="00000000-0000-0000-0000-000000000000"
                autoCapitalize="none"
                spellCheck={false}
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
              code.length !== 6 ||
              securityKey.length !== 64 ||
              sessionId.length !== 36
            }
            onClick={() =>
              sync.joinHost({
                host,
                port,
                code,
                fingerprint: securityKey,
                sessionId,
              })
            }
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
