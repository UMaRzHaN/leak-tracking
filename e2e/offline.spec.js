import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let server;

async function stopServer() {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const relativePath =
      requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
    const filePath = path.resolve(DIST_DIR, relativePath);

    if (!filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type":
          MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(4173, "127.0.0.1", resolve);
  });
});

test.afterAll(stopServer);

test("loads lazy application routes after the server goes offline", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "app:projects_v1",
      JSON.stringify([
        {
          id: "offline-e2e",
          name: "Offline E2E",
          type: "upstream",
          folderName: "Offline_E2E",
          createdAt: 1,
        },
      ]),
    );
    localStorage.setItem("app:active_id_v1", "offline-e2e");
  });

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  // A reload ensures the active worker controls this document.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  const cachedAssets = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    );
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  expect(
    cachedAssets.some(
      (asset) => asset.includes("/MapPage-") && asset.endsWith(".css"),
    ),
  ).toBe(true);
  expect(cachedAssets.some((asset) => /exceljs/i.test(asset))).toBe(false);
  expect(cachedAssets.some((asset) => /jszip/i.test(asset))).toBe(false);
  expect(cachedAssets).toEqual(
    expect.arrayContaining([
      "/manifest.json",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
    ]),
  );

  const serviceWorkerSource = await page.evaluate(async () =>
    (await fetch("/sw.js")).text(),
  );
  expect(serviceWorkerSource).toContain("ACTIVATE_UPDATE");
  expect(serviceWorkerSource).not.toContain(".then(() => self.skipWaiting())");

  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.json");
    return response.json();
  });
  expect(manifest).toMatchObject({
    id: ".",
    start_url: ".",
    scope: ".",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: "icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      }),
    ]),
  );
  const iconDimensions = await page.evaluate(async (icons) => {
    return Promise.all(
      icons.map(
        (icon) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () =>
              resolve({
                src: icon.src,
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            image.onerror = () => reject(new Error(`Cannot load ${icon.src}`));
            image.src = icon.src;
          }),
      ),
    );
  }, manifest.icons);
  expect(iconDimensions).toEqual(
    expect.arrayContaining([
      { src: "icons/icon-192.png", width: 192, height: 192 },
      { src: "icons/icon-512.png", width: 512, height: 512 },
    ]),
  );

  const manifestResponse = await page.goto("/manifest.json");
  expect(manifestResponse?.ok()).toBe(true);
  expect(manifestResponse?.headers()["content-type"]).toContain(
    "application/json",
  );

  const missingResponse = await page.goto("/missing-navigation");
  expect(missingResponse?.status()).toBe(404);
  await stopServer();
  const offlineResponse = await page.goto("/");
  expect(offlineResponse?.ok()).toBe(true);

  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Карта" })).toBeVisible();
  await page.getByRole("button", { name: "Карта" }).click();
  await expect(page.getByText("Что-то пошло не так")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Карта" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
