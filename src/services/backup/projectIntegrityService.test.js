import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPhotoSrc: vi.fn(async () => "data:image/jpeg;base64,ok"),
  loadComponents: vi.fn(async () => []),
}));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.loadComponents },
}));

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: mocks.getPhotoSrc,
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

const { analyzeProjectIntegrity, readComponentRegistryIds } =
  await import("./projectIntegrityService");

describe("analyzeProjectIntegrity", () => {
  beforeEach(() => {
    mocks.getPhotoSrc.mockReset();
    mocks.getPhotoSrc.mockResolvedValue("data:image/jpeg;base64,ok");
  });

  it("reports required status and monitoring photos", async () => {
    const report = await analyzeProjectIntegrity([
      {
        id: 1,
        leak_id: "1001",
        status: "in_progress",
        photo: "data:image/jpeg;base64,before",
        lat: 41,
        lng: 69,
        monitoringRecords: [{ date: "2026-07-14T00:00:00.000Z" }],
      },
      {
        id: 2,
        leak_id: "1002",
        status: "resolved",
        photo: "data:image/jpeg;base64,before",
        lat: 41,
        lng: 69,
      },
    ]);

    expect(report.ok).toBe(false);
    expect(report.missingRepairPhoto).toEqual(["1001"]);
    expect(report.missingAfterPhoto).toEqual(["1002"]);
    expect(report.missingMonitoringPhoto).toEqual([
      "1001:monitoringRecords[0]",
    ]);
  });

  it("reports a broken previous monitoring photo reference", async () => {
    mocks.getPhotoSrc.mockImplementation(async (path) =>
      path === "file://missing-before.jpg" ? null : "data:image/jpeg;base64,ok",
    );

    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "open",
          photo: "file://current.jpg",
          lat: 41,
          lng: 69,
          monitoringRecords: [
            {
              date: "2026-07-14T00:00:00.000Z",
              photo: "file://monitoring.jpg",
              previousPhoto: "file://missing-before.jpg",
            },
          ],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.brokenPhoto).toEqual([
      "1001:monitoringRecords[0].previousPhoto",
    ]);
    expect(report.ok).toBe(false);
  });

  it("видит обход, который есть только в ленте событий", async () => {
    // Обход пишется теперь только в ленту. Чтение сырого списка означало бы,
    // что проверка данных молча перестала смотреть на свежие осмотры: «ни
    // одного битого» и «ничего не проверено» выглядят одинаково.
    mocks.getPhotoSrc.mockImplementation(async () => null);

    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "open",
          photo: "file://current.jpg",
          lat: 41,
          lng: 69,
          events: [
            {
              id: "e1",
              type: "inspection",
              date: "2026-07-14T00:00:00.000Z",
              photo: "file://gone.jpg",
            },
          ],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.brokenPhoto).toContain("1001:monitoringRecords[0].photo");
  });

  it("проверяет и снимки ремонтов, которых нет нигде, кроме ленты", async () => {
    mocks.getPhotoSrc.mockImplementation(async (path) =>
      path === "file://repair-gone.jpg" ? null : "data:image/jpeg;base64,ok",
    );

    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "open",
          photo: "file://current.jpg",
          lat: 41,
          lng: 69,
          events: [
            {
              id: "e1",
              type: "repair_started",
              date: "2026-07-14T00:00:00.000Z",
              photo: "file://repair-gone.jpg",
            },
          ],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.brokenPhoto).toContain("1001:events[0].photo");
  });

  it("does not report a missing monitoring photo when it is optional", async () => {
    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "open",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
          monitoringRecords: [{ date: "2026-07-14T00:00:00.000Z" }],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.missingMonitoringPhoto).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("does not require status photos after an optional-photo monitoring result", async () => {
    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "resolved",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
          monitoringRecords: [
            {
              date: "2026-07-14T00:00:00.000Z",
              result: "resolved",
            },
          ],
        },
        {
          id: 2,
          leak_id: "1002",
          status: "in_progress",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
          monitoringRecords: [
            {
              date: "2026-07-14T01:00:00.000Z",
              result: "needs_recheck",
            },
          ],
        },
      ],
      { monitoringPhotoRequired: false },
    );

    expect(report.missingAfterPhoto).toEqual([]);
    expect(report.missingRepairPhoto).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("does not report a missing leak photo when it is optional", async () => {
    const report = await analyzeProjectIntegrity(
      [{ id: 1, leak_id: "1001", status: "open", lat: 41, lng: 69 }],
      { leakPhotoRequired: false },
    );

    expect(report.missingPhoto).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports null and blank coordinates as missing instead of treating them as zero", async () => {
    const report = await analyzeProjectIntegrity(
      [
        { id: "null", lat: null, lng: null },
        { id: "blank", lat: "   ", lng: "   " },
        { id: "range", lat: 91, lng: 0 },
        { id: "origin", lat: 0, lng: 0 },
      ],
      { leakPhotoRequired: false, monitoringPhotoRequired: false },
    );

    expect(report.missingCoords).toEqual(["null", "blank", "range"]);
  });

  it("detects duplicate leak tags case-insensitively", async () => {
    const report = await analyzeProjectIntegrity(
      [
        { id: "one", leak_id: " TAG-1 ", status: "open" },
        { id: "two", leak_id: "tag-1", status: "open" },
      ],
      { leakPhotoRequired: false, monitoringPhotoRequired: false },
    );

    expect(report.duplicateLeakIds).toEqual(["tag-1"]);
  });
});

describe("связи утечек с карточками реестра", () => {
  const linked = (id, componentId, uid) => ({
    id,
    leak_id: `100${id}`,
    status: "open",
    photo: "data:image/jpeg;base64,before",
    lat: 41,
    lng: 69,
    component_id: componentId,
    component_uid: uid,
  });

  it("находит утечку, чья карточка удалена", async () => {
    // Стало обычным делом: удаление карточки теперь доезжает до всех
    // устройств, а ссылка на неё остаётся на утечке.
    const report = await analyzeProjectIntegrity(
      [linked(1, "card-a", "7"), linked(2, "card-b", "8")],
      { componentIds: new Set(["card-a"]) },
    );

    // Номер в подписи — чтобы человек понимал, какой карточки не хватает.
    expect(report.missingComponent).toEqual(["1002:№8"]);
    expect(report.issues).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("не проверяет связи, когда спросить не у кого", async () => {
    // Пустой реестр и непрочитанный реестр выглядят одинаково, и принять
    // второй за первый значит объявить битыми все связи разом.
    const report = await analyzeProjectIntegrity([linked(1, "card-a", "7")], {
      componentIds: null,
    });

    expect(report.missingComponent).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("молчит об утечке, которую ни к чему не привязывали", async () => {
    const report = await analyzeProjectIntegrity(
      [
        {
          id: 1,
          leak_id: "1001",
          status: "open",
          photo: "data:image/jpeg;base64,before",
          lat: 41,
          lng: 69,
        },
      ],
      { componentIds: new Set() },
    );

    expect(report.missingComponent).toEqual([]);
  });

  it("подписывает утечку одним ярлыком, когда номер карточки не известен", async () => {
    const report = await analyzeProjectIntegrity(
      [{ ...linked(1, "card-a", ""), component_uid: "" }],
      { componentIds: new Set() },
    );

    expect(report.missingComponent).toEqual(["1001"]);
  });
});

describe("readComponentRegistryIds", () => {
  const upstream = { id: "p1", type: "upstream" };

  beforeEach(() => {
    mocks.loadComponents.mockReset();
    mocks.loadComponents.mockResolvedValue([]);
  });

  it("отдаёт карточки, которые сейчас есть, и не считает удалённые", async () => {
    mocks.loadComponents.mockResolvedValue([
      { id: "a", component_uid: "1" },
      { id: "b", component_uid: "2", deleted: true, deletedAt: 5_000 },
    ]);

    const ids = await readComponentRegistryIds(upstream);

    expect([...ids]).toEqual(["a"]);
  });

  it("молчит там, где реестра не ведут вовсе", async () => {
    // У типа проекта без реестра «связь битая» — не диагноз, а бессмыслица.
    await expect(
      readComponentRegistryIds({ id: "p2", type: "unknown" }),
    ).resolves.toBeNull();
    expect(mocks.loadComponents).not.toHaveBeenCalled();
  });

  it("молчит и тогда, когда реестр не прочитался", async () => {
    mocks.loadComponents.mockRejectedValue(new Error("storage gone"));
    await expect(readComponentRegistryIds(upstream)).resolves.toBeNull();
  });

  it("молчит без проекта", async () => {
    await expect(readComponentRegistryIds(null)).resolves.toBeNull();
  });
});
