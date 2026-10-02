import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const run = promisify(execFile);
const SCRIPT = "scripts/merge-monitoring-rounds.mjs";
const ROUND_1 = "round-1700000000000";
const ROUND_2 = "round-1800000000000";

let workdir;
beforeAll(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "merge-rounds-"));
});
afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

function inspectionsOf(leak) {
  return [
    ...(leak.events ?? []).filter((event) => event.type === "inspection"),
    ...(leak.monitoringRecords ?? []),
  ];
}

function inspection(leak, round, date) {
  return {
    id: `${leak}-${date}`,
    type: "inspection",
    date,
    result: "still_leaking",
    roundId: round === 1 ? ROUND_1 : ROUND_2,
    roundNumber: round,
  };
}

/** Копия проекта: две точки в первом обходе, одна во втором. */
function payloadFixture() {
  return {
    schemaVersion: 1,
    exportedAt: "2026-10-02T05:51:36.274Z",
    project: { name: "Проба", type: "upstream" },
    monitoringRound: {
      id: ROUND_2,
      number: 2,
      startedAt: "2026-09-16T07:28:38.450Z",
    },
    leaks: [
      {
        id: 1,
        leak_id: "001",
        events: [inspection(1, 1, "2026-09-15T08:00:00.000Z")],
      },
      {
        id: 2,
        leak_id: "002",
        events: [inspection(2, 1, "2026-09-15T09:00:00.000Z")],
      },
      {
        id: 3,
        leak_id: "003",
        events: [inspection(3, 2, "2026-09-16T08:00:00.000Z")],
      },
    ],
  };
}

async function writeProjectArchive(name, payload) {
  const zip = new JSZip();
  const { leaks, ...meta } = payload;
  zip.file("backup.json", JSON.stringify(leaks, null, 2));
  zip.file("project.json", JSON.stringify(meta, null, 2));
  const file = path.join(workdir, name);
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  return file;
}

/**
 * Excel-архив как его отдаёт приложение: книга со скрытой копией проекта на
 * листе «Project Backup», лист осмотров с таблицей `Monitoring` и снимок
 * рядом с книгой.
 */
async function writeExcelArchive(name, payload) {
  const workbook = new ExcelJS.Workbook();
  const monitoring = workbook.addWorksheet("Мониторинг");
  const rows = payload.leaks.flatMap((leak) =>
    inspectionsOf(leak).map((record) => [
      leak.id,
      leak.leak_id,
      record.roundNumber,
      record.date,
    ]),
  );
  monitoring.addTable({
    name: "Monitoring",
    ref: "A1",
    columns: ["№", "Тег", "Обход", "Дата"].map((header) => ({
      name: header,
    })),
    rows,
  });

  const backup = workbook.addWorksheet("Project Backup");
  backup.addRow(["LEAK_TRACKER_EXCEL_BACKUP", 1, "Резервная копия проекта"]);
  backup.addRow(["Chunk", "Payload", "Сводка"]);
  const serialized = JSON.stringify(payload);
  const size = Math.ceil(serialized.length / 3);
  for (let order = 0; order < 3; order += 1) {
    backup.addRow([
      order + 1,
      serialized.slice(order * size, (order + 1) * size),
    ]);
  }
  const checked = payload.leaks.filter((leak) =>
    inspectionsOf(leak).some(
      (record) => record.roundNumber === payload.monitoringRound.number,
    ),
  ).length;
  const summary = [
    ["Проект", payload.project.name],
    ["Тип", payload.project.type],
    ["Выгружено", payload.exportedAt],
    ["Утечек", payload.leaks.length],
    ["Проверок", 0],
    ["История", 0],
    ["Текущий обход", payload.monitoringRound.number],
    ["Пройдено в обходе", checked],
    ["Всего в обходе", payload.leaks.length],
    ["Осталось", payload.leaks.length - checked],
    ["Версия схемы", 1],
  ];
  summary.forEach(([label, value], order) => {
    const row = backup.getRow(5 + order);
    row.getCell(3).value = label;
    row.getCell(4).value = value;
    row.commit();
  });

  const zip = new JSZip();
  zip.file("Проба.xlsx", await workbook.xlsx.writeBuffer());
  zip.file("photos/001/before.jpg", "снимок");
  const file = path.join(workdir, name);
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  return file;
}

async function readExcelArchive(file) {
  const zip = await JSZip.loadAsync(await readFile(file));
  const name = Object.keys(zip.files).find((entry) => entry.endsWith(".xlsx"));
  const workbook = new ExcelJS.Workbook();
  // ExcelJS объявляет свой `Buffer`, несовместимый с типом из Node.
  await workbook.xlsx.load(
    /** @type {any} */ (await zip.file(name).async("nodebuffer")),
  );
  const backup = workbook.getWorksheet("Project Backup");
  let serialized = "";
  for (let row = 3; row <= backup.rowCount; row += 1) {
    const chunk = backup.getRow(row).getCell(2).value;
    if (typeof chunk === "string") serialized += chunk;
  }
  return { zip, workbook, payload: JSON.parse(serialized) };
}

describe("merge-monitoring-rounds", () => {
  it("переносит осмотры в ZIP-бэкапе проекта", async () => {
    const input = await writeProjectArchive("backup.zip", payloadFixture());
    const output = path.join(workdir, "backup-merged.zip");
    const { stdout } = await run("node", [
      SCRIPT,
      input,
      output,
      "--from=2",
      "--into=1",
    ]);

    const zip = await JSZip.loadAsync(await readFile(output));
    const leaks = JSON.parse(await zip.file("backup.json").async("string"));
    const meta = JSON.parse(await zip.file("project.json").async("string"));
    const records = leaks.flatMap(inspectionsOf);

    expect(records).toHaveLength(3);
    expect(
      records.every(
        (record) => record.roundId === ROUND_1 && record.roundNumber === 1,
      ),
    ).toBe(true);
    expect(meta.monitoringRound).toEqual({
      id: ROUND_1,
      number: 1,
      startedAt: "2023-11-14T22:13:20.000Z",
    });
    expect(stdout).toContain("Перенесено осмотров: 1");
    // исходный архив не тронут
    const source = await JSZip.loadAsync(await readFile(input));
    const sourceLeaks = JSON.parse(
      await source.file("backup.json").async("string"),
    );
    expect(
      sourceLeaks.flatMap(inspectionsOf).map((r) => r.roundNumber),
    ).toEqual([1, 1, 2]);
  });

  it("переносит осмотры в Excel-архиве: копия, лист осмотров и сводка", async () => {
    const input = await writeExcelArchive("book.zip", payloadFixture());
    const output = path.join(workdir, "book-merged.zip");
    await run("node", [SCRIPT, input, output, "--from=2", "--into=1"]);

    const { zip, workbook, payload } = await readExcelArchive(output);
    const records = payload.leaks.flatMap(inspectionsOf);
    expect(
      records.every(
        (record) => record.roundId === ROUND_1 && record.roundNumber === 1,
      ),
    ).toBe(true);
    expect(payload.monitoringRound.number).toBe(1);
    expect(payload.monitoringRound.id).toBe(ROUND_1);

    const monitoring = workbook.getWorksheet("Мониторинг");
    const rounds = new Set();
    for (let row = 2; row <= monitoring.rowCount; row += 1) {
      rounds.add(monitoring.getRow(row).getCell(3).value);
    }
    expect([...rounds]).toEqual([1]);

    const backup = workbook.getWorksheet("Project Backup");
    // текущий обход, пройдено в нём, осталось
    expect(
      [11, 12, 14].map((row) => backup.getRow(row).getCell(4).value),
    ).toEqual([1, 3, 0]);
    expect(zip.file("photos/001/before.jpg")).toBeTruthy();
  });

  it("отказывается, когда точку осмотрели в обоих обходах", async () => {
    const payload = payloadFixture();
    payload.leaks[2].events.push(inspection(3, 1, "2026-09-15T10:00:00.000Z"));
    const input = await writeProjectArchive("both.zip", payload);
    await expect(
      run("node", [
        SCRIPT,
        input,
        path.join(workdir, "both-merged.zip"),
        "--from=2",
        "--into=1",
      ]),
    ).rejects.toThrow(/Осмотрены в обоих обходах: 003/);
  });

  it("отказывается на чужом архиве и на неполных ключах", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "ничего");
    const foreign = path.join(workdir, "foreign.zip");
    await writeFile(foreign, await zip.generateAsync({ type: "nodebuffer" }));

    await expect(
      run("node", [
        SCRIPT,
        foreign,
        path.join(workdir, "foreign-merged.zip"),
        "--from=2",
        "--into=1",
      ]),
    ).rejects.toThrow(/Не похоже/);

    const input = await writeProjectArchive("args.zip", payloadFixture());
    await expect(
      run("node", [SCRIPT, input, input, "--from=2", "--into=1"]),
    ).rejects.toThrow(/поверх исходного/);
    await expect(
      run("node", [
        SCRIPT,
        input,
        path.join(workdir, "args-merged.zip"),
        "--from=2",
        "--into=2",
      ]),
    ).rejects.toThrow(/Использование/);
  });
});
