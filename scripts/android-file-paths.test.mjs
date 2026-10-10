import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSchemaDir } from "../src/repositories/schemaPaths.js";

// FileProvider отдаёт файл, только если он лежит под одним из корней
// file_paths.xml. Ошибка здесь видна лишь на телефоне, в момент, когда схема
// уже нужна, поэтому конфиг сверяется с путями, которые пишет приложение.
const xml = readFileSync(
  path.resolve("android/app/src/main/res/xml/file_paths.xml"),
  "utf8",
);

function roots(tag) {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\bpath="([^"]*)"`, "g");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

describe("android FileProvider paths", () => {
  it("covers the schema files handed to an external viewer", () => {
    const schemaDir = `${getSchemaDir("project")}/`;
    expect(
      roots("files-path").some((root) =>
        schemaDir.startsWith(root === "." ? "" : root),
      ),
    ).toBe(true);
  });

  it("does not expose the root of shared external storage", () => {
    expect(roots("external-path")).toEqual([]);
  });
});
