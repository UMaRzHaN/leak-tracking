import { describe, expect, it } from "vitest";
import {
  canWriteRegistry,
  COMPONENT_HISTORY_ACTIONS,
  recordComponentCreated,
  recordComponentEdited,
  recordComponentInspected,
} from "@/domain/componentHistory";

const user = "Мухиддин";
const now = 1_700_000_000_000;

describe("who may write to the registry", () => {
  it("wants a name before anything is recorded", () => {
    expect(canWriteRegistry({ name: "Мухиддин" })).toBe(true);
    expect(canWriteRegistry({ name: "   " })).toBe(false);
    expect(canWriteRegistry({})).toBe(false);
    expect(canWriteRegistry(null)).toBe(false);
  });

  it("refuses to sign an entry with nobody's name", () => {
    // A registry nobody signs is a list of assertions with no one behind them.
    expect(() =>
      recordComponentCreated({ id: "a" }, { user: "" }),
    ).toThrowError(/history user/i);
    expect(() =>
      recordComponentInspected({ id: "a" }, { status: "В работе" }),
    ).toThrowError(/history user/i);
  });
});

describe("creation", () => {
  it("opens the trail with who wrote the card and when", () => {
    const created = recordComponentCreated({ id: "a" }, { user, now });

    expect(created.history).toHaveLength(1);
    expect(created.history[0]).toMatchObject({
      action: COMPONENT_HISTORY_ACTIONS.CREATED,
      user,
      date: new Date(now).toISOString(),
    });
  });

  it("leaves the card itself untouched", () => {
    const created = recordComponentCreated(
      { id: "a", component_uid: "7" },
      { user, now },
    );
    expect(created.component_uid).toBe("7");
  });
});

describe("edits", () => {
  const fields = [{ key: "manufacturer" }, { key: "body_material" }];

  it("records what changed, not that a save happened", () => {
    const before = { id: "a", manufacturer: "Завод" };
    const after = { id: "a", manufacturer: "Другой" };

    const result = recordComponentEdited(before, after, { user, now, fields });

    expect(result.history).toHaveLength(1);
    expect(result.history[0].changes).toEqual([
      { key: "manufacturer", from: "Завод", to: "Другой" },
    ]);
  });

  it("writes nothing when a card is opened and closed unchanged", () => {
    // One real edit must not be buried under a hundred that changed nothing.
    const card = { id: "a", manufacturer: "Завод" };
    const result = recordComponentEdited(
      card,
      { ...card },
      {
        user,
        now,
        fields,
      },
    );

    expect(result.history).toBeUndefined();
  });

  it("appends rather than replacing what came before", () => {
    const created = recordComponentCreated({ id: "a" }, { user, now });
    const edited = recordComponentEdited(
      created,
      { ...created, manufacturer: "Завод" },
      { user, now: now + 1, fields },
    );

    expect(edited.history.map((h) => h.action)).toEqual([
      COMPONENT_HISTORY_ACTIONS.CREATED,
      COMPONENT_HISTORY_ACTIONS.EDITED,
    ]);
  });
});

describe("inspections", () => {
  it("stamps the date rather than asking for it", () => {
    const result = recordComponentInspected(
      { id: "a", component_status: "В работе" },
      { status: "Требует замены", user, now },
    );

    expect(result.inspected_at).toBe(new Date(now).toISOString());
    expect(result.component_status).toBe("Требует замены");
  });

  it("records the state the hardware was found in", () => {
    const result = recordComponentInspected(
      { id: "a", component_status: "В работе" },
      { status: "Требует замены", user, now },
    );

    expect(result.history[0]).toMatchObject({
      action: COMPONENT_HISTORY_ACTIONS.INSPECTED,
      to: "Требует замены",
      user,
    });
    expect(result.history[0].changes).toEqual([
      { key: "component_status", from: "В работе", to: "Требует замены" },
    ]);
  });

  it("still records a visit that found nothing changed", () => {
    // "Looked at it, still fine" is a fact worth keeping — it is the evidence
    // that the walk happened.
    const result = recordComponentInspected(
      { id: "a", component_status: "В работе" },
      { status: "В работе", user, now },
    );

    expect(result.history).toHaveLength(1);
    expect(result.history[0].changes).toBeUndefined();
    expect(result.inspected_at).toBe(new Date(now).toISOString());
  });

  it("keeps the current state when none is offered", () => {
    const result = recordComponentInspected(
      { id: "a", component_status: "В работе" },
      { user, now },
    );
    expect(result.component_status).toBe("В работе");
  });
});
