import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairRound } from "@/pages/Repairs/repairRoundStore";
import { writeRoundPermissions } from "@/app/project/projectSettings";
import { useRoundStartGate } from "./useRoundStartGate";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const texts = {
  disabled: "New rounds are off",
  title: "Start a new round?",
  description: "",
  confirm: "Start round",
};

function gate(overrides = {}) {
  const onReady = vi.fn();
  const notify = vi.fn();
  const hook = renderHook(() =>
    useRoundStartGate({
      projectId: "p1",
      kind: "repairs",
      store: repairRound,
      texts,
      notify,
      onReady,
      ...overrides,
    }),
  );
  return { ...hook, onReady, notify };
}

describe("useRoundStartGate", () => {
  beforeEach(() => localStorage.clear());

  it("в идущем обходе пускает к проверке сразу", () => {
    repairRound.start("p1");
    const { result, onReady } = gate();

    act(() => result.current.request(["l1"]));

    expect(onReady).toHaveBeenCalledWith(["l1"]);
  });

  it("без обхода спрашивает и после подтверждения начинает его", () => {
    const { result, onReady, rerender } = gate();

    act(() => result.current.request(["l1"]));
    expect(onReady).not.toHaveBeenCalled();
    rerender();
    render(<>{result.current.element}</>);
    act(() => screen.getByRole("button", { name: "Start round" }).click());

    expect(repairRound.read("p1")).toMatchObject({ number: 1 });
    expect(onReady).toHaveBeenCalledWith(["l1"]);
  });

  it("при выключенных новых обходах предупреждает", () => {
    writeRoundPermissions("p1", "repairs", { allowNew: false });
    const { result, onReady, notify } = gate();

    act(() => result.current.request(["l1"]));

    expect(notify).toHaveBeenCalledWith({
      type: "warning",
      message: "New rounds are off",
    });
    expect(onReady).not.toHaveBeenCalled();
  });

  it("пока идёт обход мониторинга, обход ремонтов не начинается", () => {
    localStorage.setItem(
      "app:p1:monitoring_round_v2",
      JSON.stringify({ id: "r", number: 4, startedAt: "2026-10-01" }),
    );
    const { result, onReady, notify } = gate();

    act(() => result.current.request(["l1"]));

    expect(notify.mock.calls[0][0].message).toMatch(/Monitoring round № 4/);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("сверке обход мониторинга не мешает", () => {
    localStorage.setItem(
      "app:p1:monitoring_round_v2",
      JSON.stringify({ id: "r", number: 4, startedAt: "2026-10-01" }),
    );
    const { result, notify } = gate({ kind: "reconcile" });

    act(() => result.current.request(["c1"]));

    expect(notify).not.toHaveBeenCalled();
  });
});
