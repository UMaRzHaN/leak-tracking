// Слияние одного обхода мониторинга в другой прямо в архиве проекта.
//
//   node scripts/merge-monitoring-rounds.mjs <архив.zip> <новый.zip> --from=2 --into=1
//
// Принимает оба архива, которые отдаёт приложение: ZIP-бэкап проекта
// (`backup.json` и `project.json`) и Excel-архив (книга с листом «Project
// Backup» и папкой снимков). Осмотры обхода `--from` получают идентификатор и
// номер обхода `--into`, а если текущим был `--from`, текущим снова
// становится `--into`, открытым. Исходный архив не меняется.
//
// В приложении такого действия нет: понадобилось, когда второй обход начали по
// ошибке, не закончив первый. Загружать результат — только «Перезаписать»: при
// объединении и обмене текущим остаётся обход с бо́льшим номером (см.
// `resolveMonitoringRound`), и старые отметки вернутся.
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { mergeWorkbookRounds } from "./merge-monitoring-rounds-workbook.mjs";

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (const arg of argv) {
    const match = /^--(\w+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
    else positional.push(arg);
  }
  const from = Number(options.from);
  const into = Number(options.into);
  if (
    positional.length !== 2 ||
    !Number.isInteger(from) ||
    !Number.isInteger(into) ||
    from <= 0 ||
    into <= 0 ||
    from === into
  ) {
    throw new Error(
      "Использование: merge-monitoring-rounds.mjs <архив.zip> <новый.zip> --from=N --into=M",
    );
  }
  if (positional[0] === positional[1]) {
    throw new Error("Результат пишется в новый файл, а не поверх исходного");
  }
  return { input: positional[0], output: positional[1], from, into };
}

/** Осмотры записи: из ленты событий и из старого списка. */
function inspectionsOf(leak) {
  const events = Array.isArray(leak.events) ? leak.events : [];
  const legacy = Array.isArray(leak.monitoringRecords)
    ? leak.monitoringRecords
    : [];
  return [
    ...events.filter((event) => event?.type === "inspection"),
    ...legacy.filter(Boolean),
  ];
}

/** Единственный идентификатор обхода с этим номером. */
function roundIdOf(records, number) {
  const ids = new Set(
    records
      .filter((record) => Number(record.roundNumber) === number)
      .map((record) => record.roundId),
  );
  if (ids.size > 1) {
    throw new Error(
      `У обхода №${number} несколько идентификаторов: ${[...ids].join(", ")}`,
    );
  }
  return ids.size ? [...ids][0] : null;
}

/** Начало обхода: из идентификатора `round-<мс>`, иначе по первому осмотру. */
function startedAtOf(roundId, records) {
  const stamp = /^round-(\d+)$/.exec(String(roundId))?.[1];
  if (stamp) return new Date(Number(stamp)).toISOString();
  return records
    .map((record) => record.date)
    .filter(Boolean)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
}

/**
 * Перенести осмотры и, если нужно, текущий обход. Записи правятся по месту.
 *
 * @param {any[]} leaks записи утечек
 * @param {{monitoringRound?: any}} meta где лежит текущий обход
 */
function mergeRounds(leaks, meta, from, into) {
  const all = leaks.flatMap(inspectionsOf);
  const fromId = roundIdOf(all, from);
  const intoId = roundIdOf(all, into);
  if (!intoId) throw new Error(`В архиве нет осмотров обхода №${into}`);

  // Два осмотра одной точки в одном обходе приложение не ждёт: какой из них
  // считать — решать человеку, а не скрипту.
  const twice = leaks.filter((leak) => {
    const numbers = new Set(
      inspectionsOf(leak).map((record) => Number(record.roundNumber)),
    );
    return numbers.has(from) && numbers.has(into);
  });
  if (twice.length) {
    throw new Error(
      `Осмотрены в обоих обходах: ${twice.map((leak) => leak.leak_id ?? leak.id).join(", ")}`,
    );
  }

  let moved = 0;
  for (const record of all) {
    if (Number(record.roundNumber) !== from) continue;
    record.roundId = intoId;
    record.roundNumber = into;
    moved += 1;
  }

  const current = meta.monitoringRound;
  const roundChanged = Boolean(
    current && (current.id === fromId || Number(current.number) === from),
  );
  if (roundChanged) {
    meta.monitoringRound = {
      id: intoId,
      number: into,
      startedAt: startedAtOf(
        intoId,
        all.filter((record) => record.roundId === intoId),
      ),
    };
  }

  return {
    from,
    into,
    moved,
    roundChanged,
    checked: leaks.filter((leak) =>
      inspectionsOf(leak).some((record) => record.roundId === intoId),
    ).length,
    total: leaks.length,
  };
}

/** ZIP-бэкап проекта: записи и метаданные лежат двумя файлами. */
async function mergeProjectBackup(zip, { output, from, into }) {
  const leaksFile = zip.file("backup.json");
  const metaFile = zip.file("project.json");
  const leaks = JSON.parse(await leaksFile.async("string"));
  const meta = JSON.parse(await metaFile.async("string"));

  const stats = mergeRounds(leaks, meta, from, into);

  zip.file("backup.json", JSON.stringify(leaks, null, 2));
  zip.file("project.json", JSON.stringify(meta, null, 2));
  await writeFile(output, await zip.generateAsync({ type: "nodebuffer" }));
  return stats;
}

/** Excel-архив: копия проекта спрятана в книге, рядом с ней папка снимков. */
async function mergeExcelArchive(zip, workbookName, { output, from, into }) {
  const { data, stats } = await mergeWorkbookRounds(
    await zip.file(workbookName).async("nodebuffer"),
    (payload) => mergeRounds(payload.leaks, payload, from, into),
  );
  zip.file(workbookName, data);
  await writeFile(output, await zip.generateAsync({ type: "nodebuffer" }));
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const zip = await JSZip.loadAsync(await readFile(args.input));
  const workbookName = Object.keys(zip.files).find((name) =>
    name.toLowerCase().endsWith(".xlsx"),
  );

  let stats;
  if (zip.file("backup.json") && zip.file("project.json")) {
    stats = await mergeProjectBackup(zip, args);
  } else if (workbookName) {
    stats = await mergeExcelArchive(zip, workbookName, args);
  } else {
    throw new Error(
      "Не похоже ни на ZIP-бэкап проекта, ни на Excel-архив: нет ни backup.json, ни книги",
    );
  }

  console.log(
    `Перенесено осмотров: ${stats.moved} (№${stats.from} → №${stats.into}); ` +
      `текущий обход: №${stats.roundChanged ? stats.into : "—"}; ` +
      `в нём точек: ${stats.checked} из ${stats.total}`,
  );
}

await main();
