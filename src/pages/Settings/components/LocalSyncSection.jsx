import { useState } from "react";
import s from "../Settings.module.scss";

export default function LocalSyncSection({ sync, lang }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");

  if (!sync.available) return null;

  const { status, session } = sync.state;
  const busy = ["preparing", "scanning", "joining", "merging"].includes(status);

  return (
    <section className={s.section}>
      {status === "scanning" ? (
        <div className={s.localSyncScannerOverlay} role="dialog">
          <div className={s.localSyncScannerFrame} aria-hidden="true" />
          <p>
            {lang === "ru"
              ? "Наведите камеру на QR-код"
              : "Point the camera at the QR code"}
          </p>
          <button
            type="button"
            className={s.backupBtn}
            onClick={sync.cancelScan}
          >
            {lang === "ru" ? "Отмена" : "Cancel"}
          </button>
        </div>
      ) : null}
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>
          {lang === "ru" ? "Локальная синхронизация" : "Local sync"}
        </h2>
      </div>
      <div className={s.localSyncBody}>
        <p className={s.backupHint}>
          {lang === "ru"
            ? "Оба телефона должны быть в одной Wi-Fi сети или один должен раздавать точку доступа. Интернет не требуется."
            : "Both phones must use the same Wi-Fi network or phone hotspot. Internet is not required."}
        </p>

        {status === "hosting" && session ? (
          <div className={s.localSyncSession}>
            <span>{lang === "ru" ? "Адрес" : "Address"}</span>
            <strong>{`${session.host}:${session.port}`}</strong>
            <span>{lang === "ru" ? "Код подключения" : "Pairing code"}</span>
            <strong className={s.localSyncCode}>{session.code}</strong>
            {session.qrSvg ? (
              <div
                className={s.localSyncQr}
                aria-label={
                  lang === "ru" ? "QR-код подключения" : "Connection QR code"
                }
                dangerouslySetInnerHTML={{ __html: session.qrSvg }}
              />
            ) : null}
            <button
              type="button"
              className={s.backupBtn}
              onClick={sync.stopHost}
            >
              {lang === "ru" ? "Остановить сеанс" : "Stop session"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={s.backupBtn}
            onClick={sync.startHost}
            disabled={busy}
          >
            {status === "preparing"
              ? lang === "ru"
                ? "Подготовка архива..."
                : "Preparing archive..."
              : lang === "ru"
                ? "Создать сеанс на этом телефоне"
                : "Host a session on this phone"}
          </button>
        )}

        <div className={s.localSyncDivider}>
          {lang === "ru" ? "или подключиться" : "or connect"}
        </div>

        <button
          type="button"
          className={`${s.backupBtn} ${s.restore}`}
          disabled={busy || status === "hosting"}
          onClick={sync.scanAndJoin}
        >
          {status === "scanning"
            ? lang === "ru"
              ? "Открытие камеры..."
              : "Opening camera..."
            : lang === "ru"
              ? "Сканировать QR и синхронизировать"
              : "Scan QR and synchronize"}
        </button>

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
            <span>{lang === "ru" ? "Порт" : "Port"}</span>
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
            <span>{lang === "ru" ? "Код" : "Code"}</span>
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
            ? lang === "ru"
              ? "Синхронизация..."
              : "Synchronizing..."
            : lang === "ru"
              ? "Подключиться и синхронизировать"
              : "Connect and synchronize"}
        </button>

        <p className={s.localSyncWarning}>
          {lang === "ru"
            ? "Эксперимент: используйте только доверенную локальную сеть и предварительно создайте ZIP backup."
            : "Experimental: use a trusted local network and create a ZIP backup first."}
        </p>
      </div>
    </section>
  );
}
