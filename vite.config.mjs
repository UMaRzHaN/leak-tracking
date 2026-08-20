import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "url";
import path from "path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_PRECACHE_FILES = [
  "manifest.json",
  "theme-init.js",
  "vema_sa_logo.jpg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

// Coverage floors live in one file so raising a threshold is a single edit.
// `scripts/check-coverage-ratchet.mjs` re-checks the same floors against the
// written summary; the per-directory globs are vitest-only, because the ratchet
// matches concrete file paths.
const coveragePolicy = JSON.parse(
  readFileSync(path.join(__dirname, "scripts/coverage-policy.json"), "utf8"),
);
const coverageThresholds = {
  ...coveragePolicy.global,
  ...coveragePolicy.files,
  ...coveragePolicy.directories,
};

function getHttpOrigin(value) {
  try {
    const origin = new URL(value).origin;
    return /^https?:\/\//.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

function envFlag(value) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function validateTileDeployment(mode, env) {
  if (mode === "development") return;
  const offlineOnly = envFlag(env.VITE_OFFLINE_MAP_ONLY);
  const requirePrivateProvider = envFlag(
    env.VITE_REQUIRE_PRIVATE_TILE_PROVIDER,
  );
  const tileUrl = String(env.VITE_TILE_URL || DEFAULT_TILE_URL).trim();
  if (!offlineOnly && !getHttpOrigin(tileUrl)) {
    throw new Error(
      "VITE_TILE_URL must be an absolute HTTP(S) URL or VITE_OFFLINE_MAP_ONLY=true",
    );
  }
  if (
    requirePrivateProvider &&
    !offlineOnly &&
    tileUrl.replace(/\/+$/, "") === DEFAULT_TILE_URL
  ) {
    throw new Error(
      "Protected deployment requires a private VITE_TILE_URL or VITE_OFFLINE_MAP_ONLY=true",
    );
  }
}

function cspPolicy(mode, env) {
  const offlineOnly = envFlag(env.VITE_OFFLINE_MAP_ONLY);
  const tileOrigin = offlineOnly
    ? null
    : getHttpOrigin(env.VITE_TILE_URL || DEFAULT_TILE_URL);
  const productionImgSources = ["'self'", "data:", "blob:", tileOrigin]
    .filter(Boolean)
    .join(" ");
  const productionConnectSources = ["'self'", "data:", "blob:", tileOrigin]
    .filter(Boolean)
    .join(" ");

  return {
    name: "csp-policy",
    transformIndexHtml(html) {
      const development = mode === "development";
      return html
        .replace("__VITE_DEV_STYLE__", development ? "'unsafe-inline'" : "")
        .replace(
          "__VITE_CSP_IMG__",
          development
            ? "'self' data: blob: http: https:"
            : productionImgSources,
        )
        .replace(
          "__VITE_CSP_CONNECT__",
          development
            ? "'self' data: blob: http: https: ws: wss:"
            : productionConnectSources,
        );
    },
  };
}

/**
 * Splits what the service worker precaches into what the app cannot open
 * without, and what merely makes a later screen instant.
 *
 * The essential half is the entry chunk with its static import graph and its
 * stylesheet, plus the app shell and the theme script the document runs before
 * anything else. Everything else — routes, locales, the Excel vendor — is
 * optional: missing it costs one network request the first time that screen is
 * opened, not the offline mode as a whole.
 *
 * @param {Record<string, any>} bundle rollup/rolldown output bundle
 * @param {string} basePath deployment base, with a trailing slash
 * @returns {{essential: string[], optional: string[]}}
 */
export function splitPrecacheFiles(bundle, basePath) {
  const chunks = Object.values(bundle);
  const byFileName = new Map(chunks.map((entry) => [entry.fileName, entry]));

  const essentialNames = new Set();
  const walk = (fileName) => {
    if (!fileName || essentialNames.has(fileName)) return;
    essentialNames.add(fileName);
    const entry = byFileName.get(fileName);
    if (!entry) return;
    for (const imported of entry.imports ?? []) walk(imported);
    for (const css of entry.viteMetadata?.importedCss ?? []) walk(css);
  };
  for (const entry of chunks) if (entry.isEntry) walk(entry.fileName);

  const url = (fileName) => `${basePath}${fileName}`;
  const essential = [
    basePath,
    // Стоит в head синхронно и решает тему до первой отрисовки.
    url("theme-init.js"),
    ...[...essentialNames].map(url),
  ];
  const optional = [
    ...PUBLIC_PRECACHE_FILES.map(url),
    ...chunks.map((entry) => url(entry.fileName)),
  ].filter((file) => !essential.includes(file));

  return {
    essential: [...new Set(essential)].sort(),
    optional: [...new Set(optional)].sort(),
  };
}

function offlineServiceWorker() {
  let basePath = "/";
  return {
    name: "offline-service-worker",
    apply: "build",
    configResolved(config) {
      basePath = config.base.startsWith("/") ? config.base : "/";
      if (!basePath.endsWith("/")) basePath += "/";
    },
    generateBundle(_options, bundle) {
      const { essential, optional } = splitPrecacheFiles(bundle, basePath);
      const versionHash = createHash("sha256");
      for (const entry of Object.values(bundle)) {
        versionHash.update(entry.fileName);
        versionHash.update(String(entry.code ?? entry.source ?? ""));
      }
      for (const fileName of PUBLIC_PRECACHE_FILES) {
        versionHash.update(fileName);
        versionHash.update(
          readFileSync(path.resolve(__dirname, "public", fileName)),
        );
      }
      const cacheVersion = versionHash.digest("hex").slice(0, 16);
      const source = `const PRECACHE_NAME = "leak-tracking-precache-${cacheVersion}";
const RUNTIME_NAME = "leak-tracking-runtime-${cacheVersion}";
const APP_SHELL = ${JSON.stringify(basePath)};
// Без этого приложение не откроется офлайн вовсе: оболочка, входной чанк со
// своим графом статических импортов и стилями, и скрипт темы, который стоит
// в head раньше всего остального.
const ESSENTIAL = ${JSON.stringify(essential)};
// Всё прочее — маршруты, локали, тяжёлые библиотеки. Их отсутствие в кэше
// означает лишь, что первый заход на такой экран потребует сети; подберёт их
// runtime-кэш.
const OPTIONAL = ${JSON.stringify(optional)};
let missingFromPrecache = [];
const MAX_RUNTIME_ENTRIES = 150;
const MAX_RUNTIME_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RUNTIME_RESPONSE_BYTES = 5 * 1024 * 1024;

async function matchCache(cacheName, request) {
  try {
    const cache = await caches.open(cacheName);
    const response = await cache.match(request);
    if (!response) return null;
    const cachedAt = Number(response.headers.get("x-leak-cache-time") || 0);
    if (cachedAt && Date.now() - cachedAt > MAX_RUNTIME_AGE_MS) {
      await cache.delete(request);
      return null;
    }
    return response;
  } catch {
    return null;
  }
}

function isCacheableAsset(request, response) {
  if (!response.ok || response.type === "opaque") return false;
  if (!["script", "style", "image", "font", "worker"].includes(request.destination)) {
    return false;
  }
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) {
    return false;
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  return !contentLength || contentLength <= MAX_RUNTIME_RESPONSE_BYTES;
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_ENTRIES) return;
  await Promise.all(
    keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((key) => cache.delete(key)),
  );
}

async function putRuntimeCache(request, response) {
  if (!isCacheableAsset(request, response)) return;
  try {
    const body = await response.clone().blob();
    if (body.size > MAX_RUNTIME_RESPONSE_BYTES) return;
    const headers = new Headers(response.headers);
    headers.set("x-leak-cache-time", String(Date.now()));
    const cachedResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    const cache = await caches.open(RUNTIME_NAME);
    await cache.put(request, cachedResponse);
    await trimRuntimeCache(cache);
  } catch {
    // A cache failure must not turn a successful network response into an app failure.
  }
}

// cache.addAll отменяет всю установку из-за одного неудавшегося запроса. На
// 149 файлах и 3.7 МБ по полевой связи это означало, что воркер не
// активируется вовсе — а вместе с ним не работает и runtime-кэш, который
// живёт в обработчике fetch. Человек оставался совсем без офлайна и без
// единого признака этого.
async function addTolerantly(cache, urls) {
  const missing = [];
  await Promise.all(
    urls.map((url) => cache.add(url).catch(() => missing.push(url))),
  );
  return missing;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE_NAME);
      // Оболочка обязана лечь в кэш: без неё офлайна нет по определению, и
      // установку в этом случае правильнее провалить.
      await cache.addAll(ESSENTIAL);
      missingFromPrecache = await addTolerantly(cache, OPTIONAL);
    })(),
  );
});

// Установка молчалива по устройству: сообщить о неполном кэше можно только
// когда появится, кому слушать.
async function announceIncompletePrecache() {
  if (missingFromPrecache.length === 0) return;
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: "PRECACHE_INCOMPLETE",
      missing: missingFromPrecache.length,
      total: ESSENTIAL.length + OPTIONAL.length,
    });
  }
}
self.addEventListener("message", (event) => {
  // Activation is opt-in so an old, open document never loses the hashed lazy
  // chunks it was built against. The UI may send this only immediately before
  // a controlled reload.
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("leak-tracking-") &&
                key !== PRECACHE_NAME &&
                key !== RUNTIME_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(announceIncompletePrecache),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.headers.has("range")) return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await matchCache(PRECACHE_NAME, APP_SHELL)) || Response.error(),
      ),
    );
    return;
  }
  if (!["script", "style", "image", "font", "worker"].includes(event.request.destination)) {
    return;
  }
  event.respondWith(
    matchCache(PRECACHE_NAME, event.request).then(
      (preCached) =>
        preCached ||
        matchCache(RUNTIME_NAME, event.request).then(
          (runtimeCached) =>
            runtimeCached ||
            fetch(event.request).then((response) => {
              event.waitUntil(putRuntimeCache(event.request, response.clone()));
              return response;
            }),
        ),
    ),
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  validateTileDeployment(mode, env);
  return {
    base: env.VITE_BASE_PATH || "/",
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
    plugins: [
      cspPolicy(mode, env),
      react(),
      offlineServiceWorker(),
      mode === "analyze" &&
        visualizer({
          filename: "dist/stats.html",
          open: false,
          gzipSize: true,
        }),
    ].filter(Boolean),
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Rolldown, which Vite builds with from 8, takes groups rather than
          // the entry-to-chunk map Rollup took. Same six chunks, named the
          // same: the bundle budget reads them by name, and so does anyone
          // looking at the report.
          codeSplitting: {
            groups: [
              {
                name: "vendor-react",
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              {
                name: "vendor-capacitor",
                test: /[\\/]node_modules[\\/]@capacitor(-community|-mlkit)?[\\/]/,
              },
              {
                name: "vendor-excel",
                test: /[\\/]node_modules[\\/]exceljs[\\/]/,
              },
              { name: "vendor-zip", test: /[\\/]node_modules[\\/]jszip[\\/]/ },
              // Named so the bundle report says which language a chunk is;
              // the bundler would otherwise call both "index", after the file.
              { name: "locale-ru", test: /[\\/]src[\\/]locales[\\/]ru[\\/]/ },
              { name: "locale-en", test: /[\\/]src[\\/]locales[\\/]en[\\/]/ },
            ],
          },
        },
      },
    },
    worker: {
      format: "es",
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.js"],
      // `scripts/` is listed because the gate scripts have tests too and the
      // pattern used to stop at `src/`, so those files were collected by
      // nobody and ran never. Coverage still measures `src/` alone, so the
      // thresholds below are unaffected by what is picked up here.
      include: [
        "src/**/*.{test,spec}.{js,jsx}",
        "scripts/**/*.{test,spec}.{js,mjs}",
      ],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{js,jsx}"],
        reporter: ["text", "html", "lcov", "json-summary"],
        reportsDirectory: "./coverage",
        thresholds: coverageThresholds,
        exclude: [
          "src/**/*.{test,spec}.{js,jsx}",
          "src/reportWebVitals.js",
          "src/index.jsx",
          "src/app/migrations/**",
          "scripts/**",
          "android/**",
        ],
      },
    },
  };
});
