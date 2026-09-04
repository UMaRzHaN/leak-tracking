import { describe, expect, it } from "vitest";
import JSZip from "jszip";

const { parseBackupZip } = await import("./archiveParser");

const validProject = {
  name: "Alpha",
  type: "upstream",
  folderName: "alpha",
  syncId: "sync-alpha-1234",
};

async function archive(files) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "blob" });
}

/**
 * Разбор архива: всё, что пришло из файла, — чужое, пока не доказано обратное.
 * Испорченный или собранный вручную архив должен получить внятный отказ, а не
 * уронить ввоз на середине.
 */
describe("parseBackupZip", () => {
  it("читает утечки, снимки ленты и запись проекта", async () => {
    const file = await archive({
      "backup.json": JSON.stringify([
        {
          id: 1,
          leak_id: "TAG-1",
          photo: "zip:photos/one/before.jpg",
          events: [
            {
              id: "e1",
              type: "repair_started",
              date: "2026-08-01T08:00:00.000Z",
              photo: "zip:photos/one/events/event-1.jpg",
            },
          ],
        },
      ]),
      "photos/one/before.jpg": "байты",
      "photos/one/events/event-1.jpg": "байты",
      "project.json": JSON.stringify({ project: validProject }),
    });

    const result = await parseBackupZip(file);

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0].events[0].photo).toBe(
      "zip:photos/one/events/event-1.jpg",
    );
    expect(result.meta.project.name).toBe("Alpha");
    expect(result.recoveryRecords).toEqual([]);
  });

  it("отказывает архиву без backup.json", async () => {
    const file = await archive({
      "project.json": JSON.stringify({ project: validProject }),
    });

    await expect(parseBackupZip(file)).rejects.toMatchObject({
      code: "ARCHIVE_NO_BACKUP_JSON",
    });
  });

  it("отказывает, когда backup.json — не JSON", async () => {
    const file = await archive({ "backup.json": "{ это не json" });

    await expect(parseBackupZip(file)).rejects.toMatchObject({
      code: "ARCHIVE_BACKUP_JSON_INVALID",
    });
  });

  it("отказывает снимку события, которого в архиве нет", async () => {
    // Ссылка без файла — обещание фотографии, которое некому исполнить.
    const file = await archive({
      "backup.json": JSON.stringify([
        {
          id: 1,
          events: [
            {
              id: "e1",
              type: "repair_done",
              date: "2026-08-01T14:00:00.000Z",
              photo: "zip:photos/one/events/missing.jpg",
            },
          ],
        },
      ]),
    });

    await expect(parseBackupZip(file)).rejects.toBeTruthy();
  });

  it("читает список отложенных записей рядом с утечками", async () => {
    const file = await archive({
      "backup.json": JSON.stringify([{ id: 1, leak_id: "TAG-1" }]),
      "recovery-invalid-records.json": JSON.stringify([{ id: "плохая" }]),
    });

    const result = await parseBackupZip(file);

    expect(result.recoveryRecords).toHaveLength(1);
  });

  it("отказывает, когда список отложенных записей испорчен", async () => {
    const file = await archive({
      "backup.json": JSON.stringify([{ id: 1 }]),
      "recovery-invalid-records.json": "[не json",
    });

    await expect(parseBackupZip(file)).rejects.toMatchObject({
      code: "ARCHIVE_RECOVERY_JSON_INVALID",
    });
  });

  it("берёт из старой записи проекта только имя и тип", async () => {
    // Прежние сборки писали в project.json больше полей и без проверки;
    // опознать проект по ним можно, доверять остальному — нет.
    const file = await archive({
      "backup.json": JSON.stringify([{ id: 1 }]),
      "project.json": JSON.stringify({
        project: {
          name: "  Legacy  ",
          type: "upstream",
          // Прежние сборки писали сюда число; проверку такая запись не проходит.
          syncId: 42,
        },
      }),
    });

    const result = await parseBackupZip(file);

    expect(result.meta.project).toEqual({ name: "Legacy", type: "upstream" });
  });
});
