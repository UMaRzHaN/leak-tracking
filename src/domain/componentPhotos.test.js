import { describe, expect, it } from "vitest";
import {
  getComponentDisplayPhoto,
  getComponentReconcileLog,
} from "./componentPhotos";

const inspected = (date, extra = {}) => ({
  action: "component_inspected",
  date,
  user: "Ким",
  ...extra,
});

describe("getComponentDisplayPhoto", () => {
  it("показывает снимок последней сверки, а не тот, с которым заводили", () => {
    const component = {
      photo: "idb://card",
      history: [
        inspected("2026-10-01", { photo: "idb://first-check" }),
        inspected("2026-10-02", { photo: "idb://second-check" }),
        inspected("2026-10-03"),
      ],
    };
    expect(getComponentDisplayPhoto(component)).toBe("idb://second-check");
  });

  it("без снимков сверки остаётся при главном", () => {
    expect(
      getComponentDisplayPhoto({
        photo: "idb://card",
        history: [{ action: "component_edited", photo: "x", date: "d" }],
      }),
    ).toBe("idb://card");
    expect(getComponentDisplayPhoto({})).toBeNull();
    expect(getComponentDisplayPhoto(null)).toBeNull();
  });
});

describe("getComponentReconcileLog", () => {
  it("ставит рядом со снимком сверки снимок до неё, новые сверху", () => {
    const component = {
      photo: "idb://card",
      history: [
        { action: "component_created", date: "2026-09-01", user: "Ким" },
        inspected("2026-10-01", { photo: "idb://first-check" }),
        inspected("2026-10-02", { comment: "без снимка" }),
        inspected("2026-10-03", { photo: "idb://second-check" }),
      ],
    };
    const log = getComponentReconcileLog(component);

    expect(log.map((entry) => entry.date)).toEqual([
      "2026-10-03",
      "2026-10-02",
      "2026-10-01",
    ]);
    expect(log[0].previousPhoto).toBe("idb://first-check");
    expect(log[1]).not.toHaveProperty("previousPhoto");
    expect(log[2].previousPhoto).toBe("idb://card");
  });

  it("не даёт пары, когда снимка до нет или он тот же", () => {
    const log = getComponentReconcileLog({
      photo: "idb://same",
      history: [inspected("2026-10-01", { photo: "idb://same" })],
    });
    expect(log[0]).not.toHaveProperty("previousPhoto");
    expect(getComponentReconcileLog({ history: [inspected("d")] })).toEqual([
      inspected("d"),
    ]);
  });
});
