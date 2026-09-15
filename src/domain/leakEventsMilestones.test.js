import { describe, expect, it } from "vitest";
import {
  getStatusRepairMilestones,
  withEditedRepairPhotos,
} from "./leakEvents";

const event = (id, type, date, photo) => ({
  id,
  type,
  date,
  ...(photo ? { photo } : {}),
});
const inspection = (id, date, result, photo) => ({
  ...event(id, "inspection", date, photo),
  result,
});

describe("дата и снимок ремонта по статусу", () => {
  it("у утечки, которую в ремонт отправил осмотр, берёт его дату со временем и снимок", () => {
    // Так выглядят 71 утечка архива «LDAR UNG Phase I».
    const leak = {
      status: "in_progress",
      events: [
        event("d", "detected", "2023-10-10T19:00:00.000Z"),
        inspection(
          "i1",
          "2026-09-15T13:38:10.260Z",
          "needs_recheck",
          "idb://r",
        ),
      ],
    };

    expect(getStatusRepairMilestones(leak)).toMatchObject({
      repairAt: "2026-09-15T13:38:10.260Z",
      repairPhoto: "idb://r",
      resolvedAt: null,
      resolvedPhoto: null,
    });
  });

  it("у устранённой обходом даёт и ремонт, и устранение", () => {
    const leak = {
      status: "resolved",
      events: [
        inspection(
          "i1",
          "2026-09-10T08:00:00.000Z",
          "needs_recheck",
          "idb://a",
        ),
        inspection("i2", "2026-09-15T09:30:00.000Z", "resolved", "idb://b"),
      ],
    };

    expect(getStatusRepairMilestones(leak)).toMatchObject({
      repairAt: "2026-09-10T08:00:00.000Z",
      repairPhoto: "idb://a",
      resolvedAt: "2026-09-15T09:30:00.000Z",
      resolvedPhoto: "idb://b",
    });
  });

  it("у открытой утечки молчит, даже если её прежде ремонтировали", () => {
    const leak = {
      status: "open",
      events: [
        event("r1", "repair_started", "2026-01-01T10:00:00.000Z", "idb://a"),
        event("d1", "repair_done", "2026-01-02T10:00:00.000Z", "idb://b"),
      ],
    };

    expect(getStatusRepairMilestones(leak)).toEqual({
      repairAt: null,
      repairPhoto: null,
      repairPhotoSource: null,
      resolvedAt: null,
      resolvedPhoto: null,
      resolvedPhotoSource: null,
    });
  });

  it("свежий осмотр важнее прошлой починки", () => {
    const leak = {
      status: "in_progress",
      events: [
        event("r1", "repair_started", "2026-01-01T10:00:00.000Z", "idb://old"),
        event("d1", "repair_done", "2026-01-02T10:00:00.000Z", "idb://done"),
        inspection(
          "i1",
          "2026-09-15T10:00:00.000Z",
          "needs_recheck",
          "idb://new",
        ),
      ],
    };

    expect(getStatusRepairMilestones(leak)).toMatchObject({
      repairAt: "2026-09-15T10:00:00.000Z",
      repairPhoto: "idb://new",
      repairPhotoSource: "inspection",
    });
  });

  it("свежая починка важнее прошлого осмотра", () => {
    const leak = {
      status: "in_progress",
      events: [
        inspection(
          "i1",
          "2026-01-01T10:00:00.000Z",
          "needs_recheck",
          "idb://old",
        ),
        event("r1", "repair_started", "2026-09-15T10:00:00.000Z", "idb://new"),
      ],
    };

    expect(getStatusRepairMilestones(leak)).toMatchObject({
      repairAt: "2026-09-15T10:00:00.000Z",
      repairPhoto: "idb://new",
      repairPhotoSource: "event",
    });
  });

  it("снимок, поправленный в карточке, важнее снимка осмотра", () => {
    const leak = {
      status: "in_progress",
      photo_repair: "idb://edited",
      events: [
        inspection(
          "i1",
          "2026-09-15T10:00:00.000Z",
          "needs_recheck",
          "idb://r",
        ),
      ],
    };

    expect(getStatusRepairMilestones(leak).repairPhoto).toBe("idb://edited");
  });

  it("дату без события берёт из журнала, а без журнала оставляет пустой", () => {
    const fromHistory = {
      status: "in_progress",
      history: [
        {
          action: "monitoring",
          to: "in_progress",
          date: "2026-09-04T07:00:00.000Z",
        },
      ],
    };
    // Пришла из Excel сразу «В ремонте»: момента перехода не знает никто.
    const imported = {
      status: "in_progress",
      history: [{ action: "created", date: "2023-10-10T19:00:00.000Z" }],
    };

    expect(getStatusRepairMilestones(fromHistory).repairAt).toBe(
      "2026-09-04T07:00:00.000Z",
    );
    expect(getStatusRepairMilestones(imported)).toMatchObject({
      repairAt: null,
      repairPhoto: null,
    });
  });
});

describe("снимок, заменённый в карточке", () => {
  it("меняет вложение события починки, если показывается оно", () => {
    // Прежде лента уходила дальше как null, событие не находилось, и снимок
    // оседал в поле, которого карточка не показывает.
    const leak = {
      status: "resolved",
      events: [
        event("r1", "repair_started", "2026-09-01T10:00:00.000Z", "idb://r"),
        event("d1", "repair_done", "2026-09-02T10:00:00.000Z", "idb://d"),
      ],
    };

    const patch = withEditedRepairPhotos(leak, {
      repairPhoto: "idb://r-fixed",
      afterPhoto: "idb://d-fixed",
    });

    expect(patch.events.map((item) => item.photo)).toEqual([
      "idb://r-fixed",
      "idb://d-fixed",
    ]);
    expect(patch).not.toHaveProperty("photo_repair");
    expect(patch).not.toHaveProperty("photo_after");
    expect(getStatusRepairMilestones({ ...leak, ...patch })).toMatchObject({
      repairPhoto: "idb://r-fixed",
      resolvedPhoto: "idb://d-fixed",
    });
  });

  it("не трогает снимок осмотра, а кладёт поправленный в поле записи", () => {
    const leak = {
      status: "in_progress",
      events: [
        inspection(
          "i1",
          "2026-09-15T10:00:00.000Z",
          "needs_recheck",
          "idb://r",
        ),
      ],
    };

    const patch = withEditedRepairPhotos(leak, { repairPhoto: "idb://fixed" });

    expect(patch).toEqual({ photo_repair: "idb://fixed" });
    expect(getStatusRepairMilestones({ ...leak, ...patch }).repairPhoto).toBe(
      "idb://fixed",
    );
  });
});
