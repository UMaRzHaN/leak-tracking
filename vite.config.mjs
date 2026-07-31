import { defineConfig } from "vite";
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

function offlineServiceWorker() {
  return {
    name: "offline-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = [
        "/",
        ...PUBLIC_PRECACHE_FILES.map((fileName) => `/${fileName}`),
        ...Object.values(bundle).map((entry) => `/${entry.fileName}`),
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
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
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
        (await matchCache(PRECACHE_NAME, "/")) || Response.error(),
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

export default defineConfig(({ mode }) => ({
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
    react(),
    offlineServiceWorker(),
    mode === "analyze" &&
      visualizer({ filename: "dist/stats.html", open: false, gzipSize: true }),
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
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,jsx}"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 65,
        branches: 50,
        functions: 55,
        lines: 66,
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
}));
