/**
 * Полезная нагрузка QR-кода локальной синхронизации: что кладут в код и как
 * это читают обратно.
 *
 * Отделено от сканирования, с которым лежало в одном файле: общего у них
 * только имя. Разбор — чистая функция над строкой, её гоняют тестами без
 * телефона; сканирование — камера, разрешения и жизненный цикл слушателей.
 * Держать их вместе значило упереться в потолок файла, где следующей правке
 * уже некуда деваться.
 */

import { appError } from "@/utils/appError";

const QR_PREFIX = "leak-tracker-sync:";
const QR_VERSION = 4;

export function buildLocalSyncQrPayload({
  host,
  port,
  code,
  fingerprint,
  projectKey,
  syncId,
  sessionId,
  expiresAt,
}) {
  return `${QR_PREFIX}${JSON.stringify({
    version: QR_VERSION,
    host,
    port: Number(port),
    code,
    fingerprint,
    projectKey,
    syncId,
    sessionId,
    expiresAt: Number(expiresAt),
  })}`;
}

export function parseLocalSyncQrPayload(value, expectedIdentity) {
  if (typeof value !== "string" || !value.startsWith(QR_PREFIX)) {
    throw appError("QR_NOT_LEAK_TRACKER", "Это не QR-код Leak Tracker");
  }

  let payload;
  try {
    payload = JSON.parse(value.slice(QR_PREFIX.length));
  } catch {
    throw appError("QR_CORRUPT", "QR-код синхронизации повреждён");
  }

  if (payload?.version !== QR_VERSION) {
    throw appError(
      "QR_INCOMPATIBLE_VERSION",
      "QR-код создан в несовместимой версии приложения",
    );
  }

  const validPort =
    Number.isInteger(payload?.port) &&
    payload.port > 0 &&
    payload.port <= 65535;
  const validCode = /^\d{6}$/.test(String(payload?.code ?? ""));
  const validHost =
    typeof payload?.host === "string" && payload.host.trim().length > 0;
  const validFingerprint = /^[0-9a-f]{64}$/i.test(
    String(payload?.fingerprint ?? ""),
  );
  const validSessionId =
    typeof payload?.sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.sessionId,
    );
  const validExpiresAt =
    Number.isSafeInteger(payload?.expiresAt) && payload.expiresAt > 0;
  if (
    !validHost ||
    !validPort ||
    !validCode ||
    !validFingerprint ||
    !validSessionId ||
    !validExpiresAt
  ) {
    throw appError(
      "QR_INVALID_PARAMS",
      "QR-код содержит некорректные параметры подключения",
    );
  }
  const expectedProjectKey =
    typeof expectedIdentity === "string"
      ? expectedIdentity
      : expectedIdentity?.projectKey;
  const expectedSyncId =
    typeof expectedIdentity === "object" ? expectedIdentity?.syncId : null;
  const validSyncId =
    typeof payload.syncId === "string" && payload.syncId.trim().length >= 8;
  if (!validSyncId) {
    throw appError(
      "QR_NO_PROJECT_ID",
      "QR-код не содержит идентификатор проекта",
    );
  }
  if (expectedSyncId) {
    if (payload.syncId !== expectedSyncId) {
      throw appError(
        "QR_OTHER_DATABASE",
        "QR-код относится к другой базе данных",
      );
    }
  } else if (expectedProjectKey && payload.projectKey !== expectedProjectKey) {
    throw appError("QR_OTHER_PROJECT", "QR-код создан для другого проекта");
  }

  return {
    host: payload.host.trim(),
    port: String(payload.port),
    code: String(payload.code),
    fingerprint: payload.fingerprint.toUpperCase(),
    projectKey: payload.projectKey,
    syncId: payload.syncId,
    sessionId: payload.sessionId,
    expiresAt: payload.expiresAt,
  };
}

export async function createLocalSyncQrSvg(session, identity) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(buildLocalSyncQrPayload({ ...session, ...identity }), {
    type: "svg",
    width: 232,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#101827", light: "#ffffff" },
  });
}
