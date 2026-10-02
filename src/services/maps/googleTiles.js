import {
  GOOGLE_TILES_ENABLED,
  GOOGLE_TILES_KEY,
  GOOGLE_TILES_ORIGIN,
} from "@/configs/mapTiles";
import { logger } from "@/utils/logger";

// Тайлы Google не кэшируются нигде, кроме HTTP-кэша самого WebView: условия
// Map Tiles API запрещают складывать их на устройство. Поэтому этот модуль
// отдаёт blob и не знает про tileCache.

const SESSION_STORAGE_KEY = "leak-tracking:google-tiles-session";
// Сессия живёт около двух недель; обновляем заранее, чтобы не поймать отказ
// посреди обхода.
const SESSION_MARGIN_MS = 60 * 60 * 1000;

let memorySession = /** @type {{session: string, expiresAt: number}|null} */ (
  null
);
let pendingSession =
  /** @type {Promise<{session: string, expiresAt: number}>|null} */ (null);
let disabled = !GOOGLE_TILES_ENABLED;

function isFresh(value) {
  return (
    typeof value?.session === "string" &&
    Number(value.expiresAt) - SESSION_MARGIN_MS > Date.now()
  );
}

function readStoredSession() {
  if (isFresh(memorySession)) return memorySession;
  try {
    const stored = JSON.parse(
      localStorage.getItem(SESSION_STORAGE_KEY) ?? "null",
    );
    if (isFresh(stored)) {
      memorySession = stored;
      return stored;
    }
  } catch {
    // Повреждённая запись — просто заведём новую сессию.
  }
  return null;
}

function forgetSession() {
  memorySession = null;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Хранилище недоступно — забывать нечего.
  }
}

// Неверный или ограниченный ключ не починится сам: перестаём спрашивать до
// перезапуска, иначе каждый тайл на пустом месте — ещё один отказ.
function disable(reason, status) {
  if (disabled) return;
  disabled = true;
  forgetSession();
  logger.warn("Google Map Tiles disabled", { reason, status });
}

async function createSession() {
  const response = await fetch(
    `${GOOGLE_TILES_ORIGIN}/v1/createSession?key=${encodeURIComponent(GOOGLE_TILES_KEY)}`,
    {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: "satellite",
        language: "ru-RU",
        region: "UZ",
      }),
    },
  );
  if (!response.ok) {
    // 400 здесь — «ключ не действителен», 401/403 — API не включён или ключ
    // ограничен. В любом из случаев повтор не поможет.
    if (response.status >= 400 && response.status < 500) {
      disable("session", response.status);
    }
    throw new Error(`Google tiles session failed: ${response.status}`);
  }
  const { session, expiry } = await response.json();
  const value = { session, expiresAt: Number(expiry) * 1000 };
  memorySession = value;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Без хранилища сессия проживёт до перезапуска.
  }
  return value;
}

function getSession() {
  const stored = readStoredSession();
  if (stored) return Promise.resolve(stored);
  // Сессия общая на все тайлы экрана: двадцать одновременных запросов должны
  // дождаться одной, а не завести двадцать.
  pendingSession ??= createSession().finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}

export function isGoogleTilesEnabled() {
  return !disabled;
}

/**
 * @param {{x: number, y: number, z: number}} coords
 * @param {AbortSignal} [signal]
 * @returns {Promise<Blob|null>} снимок или null, если его нет или Google недоступен
 */
export async function fetchGoogleTile({ x, y, z }, signal) {
  if (disabled) return null;
  try {
    const { session } = await getSession();
    const response = await fetch(
      `${GOOGLE_TILES_ORIGIN}/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(GOOGLE_TILES_KEY)}`,
      { mode: "cors", signal },
    );
    if (response.ok) return await response.blob();
    if (response.status === 401 || response.status === 403) {
      disable("tile", response.status);
    } else if (response.status === 400) {
      // Сессию отозвали раньше срока — следующий тайл заведёт новую.
      forgetSession();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Строка правообладателей снимков в видимой области: Google требует
 * показывать её рядом с картой, пока на ней его тайлы.
 * @param {{north: number, south: number, east: number, west: number}} bounds
 * @param {number} zoom
 * @returns {Promise<string|null>}
 */
export async function fetchGoogleCopyright(bounds, zoom) {
  if (disabled) return null;
  try {
    const { session } = await getSession();
    const params = Object.entries({
      session,
      key: GOOGLE_TILES_KEY,
      zoom,
      north: bounds.north,
      south: bounds.south,
      east: bounds.east,
      west: bounds.west,
    })
      .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
      .join("&");
    const response = await fetch(
      `${GOOGLE_TILES_ORIGIN}/tile/v1/viewport?${params}`,
      { mode: "cors" },
    );
    if (!response.ok) return null;
    const { copyright } = await response.json();
    return typeof copyright === "string" ? copyright : "";
  } catch {
    return null;
  }
}
