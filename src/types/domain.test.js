import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Сторож против осиротения.
 *
 * Типы этого файла долго не использовались нигде: семь объявлений и ни одной
 * ссылки. Такое описание расходится с кодом молча — оно ничего не проверяет и
 * ни на что не влияет, а выглядит как договор. Проверка требует, чтобы у
 * каждого объявления была хотя бы одна ссылка из кода.
 */
describe("типы домена", () => {
  const source = readFileSync("src/types/domain.ts", "utf8");
  const declared = [
    ...source.matchAll(/^export (?:type|interface) (\w+)/gm),
  ].map((match) => match[1]);

  const files = execSync("git ls-files 'src/*.js' 'src/*.jsx'")
    .toString()
    .trim()
    .split("\n")
    .filter((file) => !file.includes("/types/"));
  const code = files.map((file) => readFileSync(file, "utf8")).join("\n");

  it("объявляет то, что и раньше", () => {
    expect(declared).toEqual([
      "ProjectType",
      "LeakStatus",
      "ProjectMetadata",
      "MonitoringRecord",
      "LeakEvent",
      "LeakRecord",
      "WebDataEnvelope",
      "ImportOperation",
    ]);
  });

  it("на каждое объявление есть ссылка из кода", () => {
    // `ProjectType` виден через `ProjectMetadata`: он её поле, и отдельная
    // ссылка на него ничего бы не добавила.
    const throughOthers = new Set(["ProjectType"]);
    const orphaned = declared.filter(
      (name) =>
        !throughOthers.has(name) &&
        !code.includes(`domain").${name}`) &&
        !code.includes(`domain").${name}[`),
    );

    expect(orphaned).toEqual([]);
  });
});
