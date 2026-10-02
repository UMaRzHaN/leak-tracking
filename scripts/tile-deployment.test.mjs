import { describe, expect, it } from "vitest";
import { tileCspOrigins, validateTileDeployment } from "./tile-deployment.mjs";

const ESRI = "https://server.arcgisonline.com";
const GOOGLE = "https://tile.googleapis.com";

describe("тайловое развёртывание", () => {
  it("по умолчанию пускает в CSP только Esri", () => {
    expect(tileCspOrigins({})).toEqual([ESRI]);
  });

  it("с ключом Google добавляет его origin", () => {
    expect(tileCspOrigins({ VITE_GOOGLE_MAPS_KEY: "key" })).toEqual([
      ESRI,
      GOOGLE,
    ]);
  });

  it("пустой ключ из шаблона .env Google не включает", () => {
    expect(tileCspOrigins({ VITE_GOOGLE_MAPS_KEY: "  " })).toEqual([ESRI]);
  });

  it("в офлайн-сборке не пускает ни один сервер", () => {
    expect(
      tileCspOrigins({
        VITE_OFFLINE_MAP_ONLY: "true",
        VITE_GOOGLE_MAPS_KEY: "key",
      }),
    ).toEqual([]);
  });

  it("на защищённой площадке Google не включает даже с ключом", () => {
    expect(
      tileCspOrigins({
        VITE_REQUIRE_PRIVATE_TILE_PROVIDER: "true",
        VITE_TILE_URL: "https://tiles.corp.example/{z}/{x}/{y}",
        VITE_GOOGLE_MAPS_KEY: "key",
      }),
    ).toEqual(["https://tiles.corp.example"]);
  });

  it("не собирает защищённую площадку на публичном Esri", () => {
    expect(() =>
      validateTileDeployment("production", {
        VITE_REQUIRE_PRIVATE_TILE_PROVIDER: "true",
      }),
    ).toThrow(/private VITE_TILE_URL/);
    expect(() =>
      validateTileDeployment("production", { VITE_TILE_URL: "ftp://x" }),
    ).toThrow(/absolute HTTP/);
    expect(() =>
      validateTileDeployment("development", { VITE_TILE_URL: "ftp://x" }),
    ).not.toThrow();
  });
});
