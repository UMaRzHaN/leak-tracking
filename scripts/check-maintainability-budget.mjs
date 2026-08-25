import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Бюджет сложности: общий потолок на все исходники плюс явные исключения.
 *
 * Раньше это был список из пятнадцати файлов, перечисленных вручную. Что в
 * списке — расти не могло, а чего в списке нет — не ограничивалось ничем, и за
 * его пределами оказались пятьдесят пять файлов длиннее трёхсот строк, включая
 * самые новые. Правило перевёрнуто: ограничены все, а превышение требует
 * отдельной строки в `exceptions` — то есть решения, а не умолчания.
 *
 * `stricter` — обратный случай: модули, которым потолок задан жёстче общего,
 * потому что их намеренно держат маленькими.
 */

const policy = JSON.parse(
  readFileSync("scripts/maintainability-budget.json", "utf8"),
);
const { maxLines, exceptions = {}, stricter = {} } = policy;

function countLines(filePath) {
  const source = readFileSync(filePath, "utf8");
  return source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
}

/**
 * Обход по файловой системе, а не по `git ls-files`: неотслеженный файл гит не
 * покажет, и новый модуль оставался бы без потолка ровно до коммита — то есть
 * в тот момент, когда проверка и нужна.
 */
function collectSourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSourceFiles(full));
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      found.push(full);
    }
  }
  return found.sort();
}

const sourceFiles = collectSourceFiles("src");

const failures = [];

for (const file of sourceFiles) {
  const ceiling = exceptions[file] ?? stricter[file] ?? maxLines;
  const lines = countLines(file);
  if (lines > ceiling) {
    const reason =
      file in exceptions
        ? `исключение ${ceiling}`
        : file in stricter
          ? `свой потолок ${ceiling}`
          : `общий потолок ${maxLines} — разделите модуль или заведите строку в exceptions`;
    failures.push(`${file}: ${lines} строк > ${reason}`);
  }
}

// Храповик работает в обе стороны: запись, которая больше ничего не сдерживает,
// молча возвращает файлу право расти обратно.
for (const file of Object.keys(exceptions)) {
  if (!existsSync(file)) {
    failures.push(`${file}: файла нет, уберите запись из exceptions`);
    continue;
  }
  // Превышение самого потолка ловит цикл выше — здесь только про запись,
  // которая больше ничего не сдерживает.
  if (countLines(file) <= maxLines) {
    failures.push(
      `${file}: ${countLines(file)} строк, уже под общим потолком ${maxLines} — уберите запись из exceptions`,
    );
  }
}

for (const file of Object.keys(stricter)) {
  if (!existsSync(file)) {
    failures.push(`${file}: файла нет, уберите запись из stricter`);
  }
}

if (failures.length > 0) {
  throw new Error(`Maintainability budget failed:\n${failures.join("\n")}`);
}
console.log(
  `Maintainability budget passed: ${sourceFiles.length} файлов, потолок ${maxLines}, исключений ${Object.keys(exceptions).length}`,
);
