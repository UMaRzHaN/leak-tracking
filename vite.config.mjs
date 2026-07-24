import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "url";
import path from "path";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function offlineServiceWorker() {
  const OPTIONAL_RUNTIME_ASSET = /(?:exceljs|jszip|excelExport\.worker)/i;

  function shouldPrecache(entry) {
    return !OPTIONAL_RUNTIME_ASSET.test(entry.fileName);
  }
  return {
    name: "offline-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = [
        "/",
        "/manifest.json",
        "/vema_sa_logo.jpg",
        ...Object.values(bundle)
          .filter(shouldPrecache)
          .map((entry) => `/${entry.fileName}`),
      ];
      const uniqueFiles = [...new Set(files)].sort();
      const cacheVersion = createHash("sha256")
        .update(
          Object.values(bundle)
            .filter(shouldPrecache)
            .map(
              (entry) =>
                `${entry.fileName}:${String(entry.code ?? entry.source ?? "")}`,
            )
            .join("\n"),
        )
        .digest("hex")
        .slice(0, 16);
      const source = `const CACHE_NAME = "leak-tracking-${cacheVersion}";
const PRECACHE = ${JSON.stringify(uniqueFiles)};
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
          .filter((key) => key.startsWith("leak-tracking-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error())),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }),
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
          // exceljs & jszip removed - now loaded via dynamic import() on-demand
          // they will code-split automatically when imported dynamically
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
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 70,
        branches: 58,
        functions: 70,
        lines: 73,
      },
      exclude: [
        "src/reportWebVitals.js",
        "src/index.jsx",
        "src/app/migrations/**",
        "scripts/**",
        "android/**",
      ],
    },
  },
}));
