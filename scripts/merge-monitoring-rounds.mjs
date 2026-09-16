// Слияние одного обхода мониторинга в другой прямо в архиве проекта.
//
//   node scripts/merge-monitoring-rounds.mjs <архив.zip> <новый.zip> --from=2 --into=1
//
// Осмотры обхода `--from` получают идентификатор и номер обхода `--into`, а
// если текущим в `project.json` был `--from`, текущим снова становится
// `--into`, открытым. Исходный архив не меняется.
//
// В приложении такого действия нет: понадобилось, когда второй обход начали по
// ошибке, не закончив первый. Загружать результат — только «Заменить»: при
// объединении и обмене текущим остаётся обход с бо́льшим номером (см.
// `resolveMonitoringRound`), и старые отметки вернутся.
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

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

async function main() {
  const { input, output, from, into } = parseArgs(process.argv.slice(2));
  const zip = await JSZip.loadAsync(await readFile(input));
  const leaksFile = zip.file("backup.json");
  const metaFile = zip.file("project.json");
  if (!leaksFile || !metaFile) {
    throw new Error("В архиве нет backup.json или project.json");
  }
  const leaks = JSON.parse(await leaksFile.async("string"));
  const meta = JSON.parse(await metaFile.async("string"));

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
  if (current && (current.id === fromId || Number(current.number) === from)) {
    meta.monitoringRound = {
      id: intoId,
      number: into,
      startedAt: startedAtOf(
        intoId,
        all.filter((record) => record.roundId === intoId),
      ),
    };
  }

  zip.file("backup.json", JSON.stringify(leaks, null, 2));
  zip.file("project.json", JSON.stringify(meta, null, 2));
  await writeFile(output, await zip.generateAsync({ type: "nodebuffer" }));

  console.log(
    `Перенесено осмотров: ${moved} (№${from} → №${into}); текущий обход: №${meta.monitoringRound?.number ?? "—"}`,
  );
}

await main();
