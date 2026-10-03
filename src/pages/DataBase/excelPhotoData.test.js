import { describe, expect, it } from "vitest";
import {
  allocateLeakFolderNames,
  planRoundMonitoringFolders,
} from "./excelPhotoData";

const folderStatus = {
  open: "утечка есть",
  in_progress: "в ремонте",
  resolved: "утечки нет",
};

describe("allocateLeakFolderNames", () => {
  it("дописывает к бирке состояние утечки", () => {
    expect(
      allocateLeakFolderNames(
        [
          { leak_id: "3242", status: "open" },
          { leak_id: "3243", status: "in_progress" },
          { leak_id: "3244", status: "resolved" },
          { leak_id: "3245" },
        ],
        folderStatus,
      ),
    ).toEqual([
      "3242 (утечка есть)",
      "3243 (в ремонте)",
      "3244 (утечки нет)",
      "3245 (утечка есть)",
    ]);
  });

  it("у совпавших бирок отличие стоит при бирке, а скобка — последней", () => {
    expect(
      allocateLeakFolderNames(
        [
          { id: "a", leak_id: "7", status: "open" },
          { id: "b", leak_id: "7", status: "resolved" },
        ],
        folderStatus,
      ),
    ).toEqual(["7 (утечка есть)", "7~b (утечки нет)"]);
  });

  it("без подписей оставляет одну бирку", () => {
    expect(allocateLeakFolderNames([{ leak_id: "3242" }], null)).toEqual([
      "3242",
    ]);
  });
});

describe("planRoundMonitoringFolders", () => {
  it("кладёт осмотры в папку обхода с итогом этого обхода", () => {
    const leak = {
      leak_id: "3242",
      status: "resolved",
      events: [
        {
          type: "inspection",
          date: "2026-09-01T10:00:00.000Z",
          roundNumber: 1,
          result: "still_leaking",
        },
        {
          type: "inspection",
          date: "2026-09-20T10:00:00.000Z",
          roundNumber: 2,
          result: "still_leaking",
        },
        {
          type: "inspection",
          date: "2026-09-21T10:00:00.000Z",
          roundNumber: 2,
          result: "resolved",
        },
      ],
    };

    const place = planRoundMonitoringFolders([leak], {
      folderStatus,
      roundFolder: "Обход",
    });

    expect(place(0, 0)).toEqual({
      roundSegment: "Обход 1",
      leakSegment: "3242 (утечка есть)",
      recordNumber: 1,
    });
    expect(place(0, 1)).toEqual({
      roundSegment: "Обход 2",
      leakSegment: "3242 (утечки нет)",
      recordNumber: 1,
    });
    expect(place(0, 2)).toMatchObject({
      roundSegment: "Обход 2",
      recordNumber: 2,
    });
  });
});
