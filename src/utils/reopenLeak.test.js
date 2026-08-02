import { describe, expect, it } from "vitest";
import { STATUS } from "@/utils/status";
import {
  buildReopenCalcVars,
  buildReopenedLeak,
  normalizeReopenMeasurements,
} from "./reopenLeak";

describe("reopenLeak", () => {
  it("normalizes only entered measurement values", () => {
    expect(
      normalizeReopenMeasurements({
        leak_speed: "12,5 L/min",
        pressure: "",
        temperature: "-4 °C",
      }),
    ).toEqual({ leak_speed: 12.5, temperature: -4 });
  });

  it("keeps flare and utilization percentages consistent", () => {
    const leak = {
      calculationParams: {
        percentage_gas_to_flare: 20,
        percentage_gas_to_utilization: 80,
      },
    };

    expect(
      buildReopenCalcVars({
        leak,
        vars: {},
        draft: { calcVars: { percentage_gas_to_flare: "35" } },
      }),
    ).toMatchObject({
      percentage_gas_to_flare: 35,
      percentage_gas_to_utilization: 65,
    });
    expect(
      buildReopenCalcVars({
        leak,
        vars: {},
        draft: { calcVars: { percentage_gas_to_flare: "" } },
      }),
    ).toMatchObject({
      percentage_gas_to_flare: null,
      percentage_gas_to_utilization: null,
    });
  });

  it("reopens a resolved leak, promotes its latest photo and records history", () => {
    const reopened = buildReopenedLeak({
      leak: {
        id: "leak-1",
        status: STATUS.RESOLVED,
        leak_speed: 5,
        photo: "idb://before",
        photo_after: "idb://resolved",
        resolvedAt: 100,
        history: [{ action: "created" }],
      },
      draft: { leak_speed: "60", pressure: "2" },
      vars: {},
      now: 1784104200000,
      user: "Inspector",
    });

    expect(reopened).toMatchObject({
      id: "leak-1",
      status: STATUS.OPEN,
      leak_speed: 60,
      pressure: 2,
      priority: "high",
      photo: "idb://resolved",
      photo_after: null,
      resolvedAt: null,
      updatedAt: 1784104200000,
    });
    expect(reopened.history).toHaveLength(2);
    expect(reopened.history.at(-1)).toMatchObject({
      action: "status_changed",
      to: STATUS.OPEN,
      date: "2026-07-15T08:30:00.000Z",
      user: "Inspector",
    });
  });

  it("rejects reopening without a history user", () => {
    expect(() =>
      buildReopenedLeak({
        leak: { status: STATUS.RESOLVED },
        draft: {},
        vars: {},
      }),
    ).toThrowError(expect.objectContaining({ code: "HISTORY_USER_REQUIRED" }));
  });
});
