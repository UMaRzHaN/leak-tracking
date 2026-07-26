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
  expect(cachedAssets.some((asset) => /exceljs/i.test(asset))).toBe(true);
  expect(cachedAssets.some((asset) => /jszip/i.test(asset))).toBe(true);

  await stopServer();
  await page.reload();

  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Карта" })).toBeVisible();
  await page.getByRole("button", { name: "Карта" }).click();
  await expect(page.getByText("Что-то пошло не так")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Карта" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
