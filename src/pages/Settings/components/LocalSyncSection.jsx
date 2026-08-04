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

function getTexts(t, status) {
  return {
    title: t("localSync.title"),
    lead: t("localSync.lead"),
    hostTitle: t("localSync.hostTitle"),
    hostHint: t("localSync.hostHint"),
    hostIdle: t("localSync.hostIdle"),
    hostPreparing: t("localSync.hostPreparing"),
    stop: t("localSync.stop"),
    expiresIn: t("localSync.expiresIn"),
    transferred: t("localSync.transferred"),
    sessionId: t("localSync.sessionId"),
    multiDevice: t("localSync.multiDevice"),
    multiDeviceHint: t("localSync.multiDeviceHint"),
    approvalTitle: t("localSync.approvalTitle"),
    approvalSync: t("localSync.approvalSync"),
    approvalImport: t("localSync.approvalImport"),
    peerAddress: t("localSync.peerAddress"),
    approve: t("localSync.approve"),
    reject: t("localSync.reject"),
    peerTitle: t("localSync.peerTitle"),
    peerHint: t("localSync.peerHint"),
    scanSync: t("localSync.scanSync"),
    scanSyncLoading: t("localSync.scanSyncLoading"),
    scanImport: t("localSync.scanImport"),
    scanImportLoading: t("localSync.scanImportLoading"),
    manualTitle: t("localSync.manualTitle"),
    manualHint: t("localSync.manualHint"),
    address: t("localSync.address"),
    code: t("localSync.code"),
    securityKey: t("localSync.securityKey"),
    port: t("localSync.port"),
    connect: t("localSync.connect"),
    connecting: t("localSync.connecting"),
    overlay: t("localSync.overlay"),
    cancel: t("localSync.cancel"),
    warning: t("localSync.warning"),
    // A status the locale does not name falls back to the idle one rather
    // than showing a raw key.
    status: t(`localSync.status.${status}`, {
      defaultValue: t("localSync.status.idle"),
    }),
  };
}

export default function LocalSyncSection({ sync }) {
  const { t } = useLanguage();

  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");
  const [securityKey, setSecurityKey] = useState("");
  const [sessionId, setSessionId] = useState("");

  if (!sync.available) return null;

  const { status, session } = sync.state;
  const busy = SYNC_BUSY_STATUSES.has(status);
  const texts = getTexts(t, status);
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
