import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/features/componentRegistry/useComponentRegistry", () => ({
  useComponentRegistry: () => ({
    components: [
      {
        id: "a",
        component_uid: "0001",
        component: "Кран",
        // Осмотрен после начала сверки — сверен.
        inspected_at: "2026-10-07T10:00:00.000Z",
      },
    ],
    updateComponent: vi.fn(),
    loading: false,
  }),
}));
vi.mock("@/features/componentRegistry/ComponentCardCompact", () => ({
  default: ({ component, onInspect, onOpenDetails }) => (
    <>
      <button type="button" onClick={() => onInspect(component)}>
        swipe {component.component_uid}
      </button>
      <button type="button" onClick={() => onOpenDetails(component)}>
        open {component.component_uid}
      </button>
    </>
  ),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ savePhoto: vi.fn() }),
}));
vi.mock("@/features/componentRegistry/ComponentDetailsSheet", () => ({
  default: ({ component }) => (
    <div role="dialog" aria-label={`card ${component.component_uid}`} />
  ),
}));
vi.mock("@/features/componentRegistry/useComponentCheck", () => ({
  useComponentCheck: () => ({ open: mocks.open, element: null }),
}));

const Reconcile = (await import("./Reconcile")).default;

describe("Reconcile", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("offers to reconcile a reconciled component again, with a prompt", () => {
    localStorage.setItem(
      "app:p1:reconcile_round_v1",
      JSON.stringify({ number: 3, startedAt: "2026-10-07T09:00:00.000Z" }),
    );
    render(<Reconcile project={{ id: "p1" }} userProfile={{ name: "Азиз" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Reconciled 1/ }));

    // Кнопка на месте и у сверенного, но сначала спрашивает — как свайп.
    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));
    expect(mocks.open).not.toHaveBeenCalled();
    expect(
      screen.getByText("Component already reconciled in this round"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reconcile again" }));
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    );

    mocks.open.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "swipe 0001" }));
    expect(mocks.open).not.toHaveBeenCalled();
    expect(
      screen.getByText("Component already reconciled in this round"),
    ).toBeTruthy();
  });

  it("opens the whole card on swipe right, like the component base", () => {
    render(<Reconcile project={{ id: "p1" }} userProfile={{ name: "Азиз" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^All 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "open 0001" }));
    expect(screen.getByRole("dialog", { name: "card 0001" })).toBeTruthy();
  });
});
