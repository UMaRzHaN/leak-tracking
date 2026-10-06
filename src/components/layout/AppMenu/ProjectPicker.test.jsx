import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const state = vi.hoisted(() => ({
  selectProject: vi.fn(),
  clearForm: vi.fn(),
  form: {},
  dirty: false,
}));
vi.mock("@/app/project/ProjectContext", () => ({
  useProject: () => ({
    projects: [
      { id: "a", name: "Тенгиз Q1", type: "upstream" },
      { id: "b", name: "LDAR UNG Phase II", type: "midstream" },
    ],
    activeProject: { id: "a", name: "Тенгиз Q1" },
    selectProject: state.selectProject,
  }),
}));
vi.mock("@/features/leakForm/LeakFormContext", () => ({
  useLeakFormContext: () => ({ form: state.form, clearForm: state.clearForm }),
}));
vi.mock("@/features/leakForm/utils/isLeakFormDirty", () => ({
  isLeakFormDirty: () => state.dirty,
}));
vi.mock("@/services/maps/tileCache", () => ({
  clearMapCache: vi.fn(async () => {}),
}));

const ProjectPicker = (await import("./ProjectPicker")).default;

describe("ProjectPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.dirty = false;
  });

  it("opens the project list and switches on tap", async () => {
    const onSwitched = vi.fn();
    render(<ProjectPicker onSwitched={onSwitched} onManage={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Switch project"));
    const list = screen.getByRole("list", { name: "Projects" });
    expect(
      within(list)
        .getByRole("button", { name: /Тенгиз Q1/ })
        .getAttribute("aria-current"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /LDAR UNG Phase II/ }));

    await waitFor(() => expect(onSwitched).toHaveBeenCalled());
    expect(state.selectProject).toHaveBeenCalledWith("b");
    expect(state.clearForm).toHaveBeenCalled();
  });

  it("asks before dropping an unfinished leak form", async () => {
    state.dirty = true;
    render(<ProjectPicker onSwitched={vi.fn()} onManage={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Switch project"));
    fireEvent.click(screen.getByRole("button", { name: /LDAR UNG Phase II/ }));
    expect(state.selectProject).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Switch" }));
    await waitFor(() => expect(state.selectProject).toHaveBeenCalledWith("b"));
  });

  it("leads to project management in settings", () => {
    const onManage = vi.fn();
    render(<ProjectPicker onSwitched={vi.fn()} onManage={onManage} />);

    fireEvent.click(screen.getByTitle("Switch project"));
    fireEvent.click(screen.getByRole("button", { name: /Manage projects/ }));
    expect(onManage).toHaveBeenCalledOnce();
  });
});
