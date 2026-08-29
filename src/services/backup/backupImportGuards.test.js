import { describe, expect, it } from "vitest";
import { resolveIncomingApplication } from "./backupImportGuards";
import { shouldApplyIncomingProjectSettings } from "@/app/project/projectSettings";

/**
 * Что из архива берётся поверх местного.
 *
 * Проверяется симметрия: решение принимают оба телефона, каждый со своей
 * стороны, и оно обязано сойтись. Правило вида «взять, если чужое строго
 * свежее» симметрию нарушает ровно на ничьей — тогда ни один не берёт чужое, и
 * стороны расходятся навсегда.
 */
const base = {
  mode: "merge",
  isSync: true,
  localSettings: { updatedAt: 0, hiddenFields: [] },
  shouldApplyIncomingProjectSettings,
};

/** Решение каждой из сторон при обмене между двумя телефонами. */
function bothSides({ varsA, varsB, atA, atB }) {
  const onA = resolveIncomingApplication({
    ...base,
    incomingMeta: { vars: varsB, sync: { varsUpdatedAt: atB } },
    localSyncState: { varsUpdatedAt: atA },
    localVars: varsA,
  });
  const onB = resolveIncomingApplication({
    ...base,
    incomingMeta: { vars: varsA, sync: { varsUpdatedAt: atA } },
    localSyncState: { varsUpdatedAt: atB },
    localVars: varsB,
  });
  return [onA.shouldApplyIncomingVars, onB.shouldApplyIncomingVars];
}

const TIE = 1_772_100_000_000;

describe("параметры расчёта при синхронизации", () => {
  it("свежие берутся, устаревшие — нет", () => {
    expect(
      bothSides({
        varsA: { density: 0.72 },
        varsB: { density: 0.68 },
        atA: TIE,
        atB: TIE + 1000,
      }),
    ).toEqual([true, false]);
  });

  it("при равной отметке чужое принимает ровно одна сторона", () => {
    // Иначе каждый телефон оставляет своё, и по одному проекту получаются
    // разные выбросы: плотность и GWP входят в расчёт напрямую.
    const decisions = bothSides({
      varsA: { density: 0.72 },
      varsB: { density: 0.68 },
      atA: TIE,
      atB: TIE,
    });

    expect(decisions.filter(Boolean)).toHaveLength(1);
  });

  it("равные параметры при равной отметке никого не тревожат", () => {
    expect(
      bothSides({
        varsA: { density: 0.72 },
        varsB: { density: 0.72 },
        atA: TIE,
        atB: TIE,
      }),
    ).toEqual([false, false]);
  });

  it("порядок ключей на решение не влияет", () => {
    // Одни и те же параметры, записанные в разном порядке, — это одно и то же.
    expect(
      bothSides({
        varsA: { density: 0.72, GWP: 28 },
        varsB: { GWP: 28, density: 0.72 },
        atA: TIE,
        atB: TIE,
      }),
    ).toEqual([false, false]);
  });

  it("вне синхронизации параметры архива не применяются", () => {
    // При слиянии архива параметры остаются своими: смешивать плотности из
    // двух проектов нельзя.
    const decision = resolveIncomingApplication({
      ...base,
      isSync: false,
      incomingMeta: { vars: { density: 0.68 }, sync: { varsUpdatedAt: TIE } },
      localSyncState: { varsUpdatedAt: 0 },
      localVars: { density: 0.72 },
    });

    expect(decision.shouldApplyIncomingVars).toBe(false);
  });

  it("перезапись берёт параметры архива целиком", () => {
    const decision = resolveIncomingApplication({
      ...base,
      mode: "overwrite",
      incomingMeta: { vars: { density: 0.68 }, sync: { varsUpdatedAt: 0 } },
      localSyncState: { varsUpdatedAt: TIE },
      localVars: { density: 0.72 },
    });

    expect(decision.vars).toEqual({ density: 0.68 });
  });
});
