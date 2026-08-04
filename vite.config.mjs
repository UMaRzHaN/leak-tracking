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
      const files = [
        basePath,
        ...PUBLIC_PRECACHE_FILES.map((fileName) => `${basePath}${fileName}`),
        ...Object.values(bundle).map((entry) => `${basePath}${entry.fileName}`),
      ];
      const uniqueFiles = [...new Set(files)].sort();
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
const PRECACHE = ${JSON.stringify(uniqueFiles)};
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE)),
  );
});
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
      .then(() => self.clients.claim()),
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
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-capacitor": [
              "@capacitor/core",
              "@capacitor/filesystem",
              "@capacitor/camera",
              "@capacitor/geolocation",
              "@capacitor/share",
              "@capacitor-community/speech-recognition",
            ],
            "vendor-excel": ["exceljs"],
            "vendor-zip": ["jszip"],
            // Named so the bundle report says which language a chunk is;
            // Rollup would otherwise call both "index", after the file.
            "locale-ru": ["@/locales/ru"],
            "locale-en": ["@/locales/en"],
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
      include: ["src/**/*.{test,spec}.{js,jsx}"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{js,jsx}"],
        reporter: ["text", "html", "lcov", "json-summary"],
        reportsDirectory: "./coverage",
        thresholds: {
          statements: 78,
          branches: 67,
          functions: 72,
          lines: 80,
          "src/features/leakForm/**": {
            statements: 50,
            branches: 30,
            functions: 50,
            lines: 55,
          },
          "src/pages/MainPage/MainPage.jsx": {
            statements: 95,
            branches: 90,
            functions: 95,
            lines: 95,
          },
          "src/pages/DataBase/DataBase.jsx": {
            statements: 75,
            branches: 45,
            functions: 65,
            lines: 75,
          },
          "src/pages/MapPage/MapPage.jsx": {
            statements: 95,
            branches: 75,
            functions: 95,
            lines: 95,
          },
          "src/pages/Settings/Settings.jsx": {
            statements: 30,
            branches: 15,
            functions: 30,
            lines: 30,
          },
          "src/pages/Settings/hooks/useSettingsPage.js": {
            statements: 45,
            branches: 25,
            functions: 40,
            lines: 45,
          },
          "src/app/project/ProjectContext.jsx": {
            statements: 87,
            branches: 69,
            functions: 94,
            lines: 90,
          },
          "src/repositories/LeakRepository.js": {
            statements: 87,
            branches: 82,
            functions: 78,
            lines: 91,
          },
          "src/repositories/PhotoRepository.js": {
            statements: 90,
            branches: 88,
            functions: 89,
            lines: 92,
          },
          "src/services/backup/projectCleanup.js": {
            statements: 84,
            branches: 71,
            functions: 66,
            lines: 91,
          },
          "src/services/import/excelImportTransaction.js": {
            statements: 100,
            branches: 82,
            functions: 100,
            lines: 100,
          },
          "src/pages/MapPage/hooks/useOfflineMapActions.js": {
            statements: 85,
            branches: 60,
            functions: 77,
            lines: 91,
          },
          "src/pages/AddLeak/**": {
            statements: 40,
            branches: 30,
            functions: 40,
            lines: 45,
          },
          "src/services/maps/tileCache.js": {
            statements: 90,
            branches: 80,
            functions: 80,
            lines: 95,
          },
          "src/pages/Monitoring/**": {
            statements: 70,
            branches: 60,
            functions: 60,
            lines: 75,
          },
        },
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
