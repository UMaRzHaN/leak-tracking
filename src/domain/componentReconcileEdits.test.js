import { describe, expect, it } from "vitest";
import {
  applyReconcileEdits,
  hasReconcileEdits,
  reconcileEntries,
} from "./componentReconcileEdits";

const inspected = (date, to, extra = {}) => ({
  action: "component_inspected",
  date: `${date}T10:00:00.000Z`,
  user: "Азиз",
  to,
  ...extra,
});

const card = {
  id: "c1",
  component_status: "В работе",
  history: [
    {
      action: "component_created",
      date: "2026-09-01T10:00:00.000Z",
      user: "Азиз",
    },
    inspected("2026-09-10", "Требует замены", { roundNumber: 1 }),
    inspected("2026-10-05", "В работе", { roundNumber: 2, photo: "idb://p" }),
  ],
};

describe("componentReconcileEdits", () => {
  it("даёт сверки новыми сверху, с ключом по месту в истории", () => {
    expect(reconcileEntries(card).map(({ key }) => key)).toEqual(["h2", "h1"]);
  });

  it("состояние последней сверки ведёт состояние карточки", () => {
    const { component, changes } = applyReconcileEdits(card, {
      h2: { to: "Законсервирован", comment: " кран закрыт " },
    });

    expect(component.history[2]).toMatchObject({
      to: "Законсервирован",
      comment: "кран закрыт",
      roundNumber: 2,
      photo: "idb://p",
      user: "Азиз",
    });
    expect(component.component_status).toBe("Законсервирован");
    expect(changes).toEqual([
      expect.objectContaining({
        key: "to",
        from: "В работе",
        to: "Законсервирован",
        record: { kind: "reconcile", date: "2026-10-05T10:00:00.000Z" },
      }),
      expect.objectContaining({ key: "comment", to: "кран закрыт" }),
    ]);
  });

  it("старая сверка состояние карточки не трогает", () => {
    const { component } = applyReconcileEdits(card, {
      h1: { to: "В работе" },
    });
    expect(component.history[1].to).toBe("В работе");
    expect(component.component_status).toBe("В работе");
  });

  it("состояние, поправленное в карточке руками, побеждает", () => {
    const { component } = applyReconcileEdits(
      { ...card, component_status: "Демонтирован" },
      { h2: { to: "Законсервирован" } },
      card,
    );
    expect(component.component_status).toBe("Демонтирован");
  });

  it("правка, вернувшая прежнее, правкой не считается", () => {
    const edits = { h2: { to: "В работе ", comment: "" } };
    expect(hasReconcileEdits(card, edits)).toBe(false);
    expect(applyReconcileEdits(card, edits)).toEqual({
      component: card,
      changes: [],
    });
  });
});
