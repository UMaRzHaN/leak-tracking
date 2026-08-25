import { describe, expect, it } from "vitest";
import { isExcelVendorChunk } from "./bundle-chunk-names.mjs";

/**
 * Классификатор молчал, и это никого не насторожило: страж «ExcelJS остаётся
 * ленивым» и не должен срабатывать, пока всё в порядке. Отличить «работает и
 * молчит» от «сломан и молчит» можно только проверкой самого предиката.
 */
describe("isExcelVendorChunk", () => {
  // Имена приходят из index.html с префиксом каталога. Прежний шаблон требовал
  // границы слова перед `excel`, слева оказывался слэш — и весь страж
  // превращался в тишину.
  it.each([
    "assets/vendor-excel-A4ttT89u.js",
    "assets/exceljs.min-CGsaihOS.js",
    "vendor-excel-A4ttT89u.js",
    "exceljs.min-CGsaihOS.js",
  ])("узнаёт вендорский чанк: %s", (name) => {
    expect(isExcelVendorChunk(name)).toBe(true);
  });

  // `excel-*.js` собирает configs/shared/excel.js — обязательные колонки
  // выгрузки. Это код приложения, и в начальном графе он стоит законно;
  // воркер считается отдельной статьёй бюджета.
  it.each([
    "assets/excel-BX7ijbJF.js",
    "assets/excel.worker-ChPgFj4O.js",
    "assets/excelImportService-C0qmFyjL.js",
    "assets/index-fYhpEP9R.js",
    "assets/vendor-react-TnBvT0Ph.js",
  ])("не принимает за вендора: %s", (name) => {
    expect(isExcelVendorChunk(name)).toBe(false);
  });

  it("не падает на пустом и нестроковом", () => {
    expect(isExcelVendorChunk("")).toBe(false);
    expect(isExcelVendorChunk(undefined)).toBe(false);
  });
});
