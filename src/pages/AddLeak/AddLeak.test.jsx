import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddLeak from "./AddLeak";

const mocks = vi.hoisted(() => ({
  initialForm: {},
  submittedRow: { leak_id: "TAG-1", leak_speed: "2.5" },
  hasDraft: vi.fn(() => false),
  loadDraft: vi.fn(() => null),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
  savePhoto: vi.fn(),
  deletePhoto: vi.fn(),
  hapticSuccess: vi.fn(),
  hapticWarning: vi.fn(),
}));

vi.mock("@/features/leakForm/LeakFormContext", async () => {
  const React = await import("react");
  return {
    useLeakFormContext() {
      const [form, setForm] = React.useState(mocks.initialForm);
      return { form, setForm };
    },
  };
});
vi.mock("@/hooks/useFormDraft", () => ({
  useFormDraft: () => ({
    hasDraft: mocks.hasDraft,
    loadDraft: mocks.loadDraft,
    saveDraft: mocks.saveDraft,
    clearDraft: mocks.clearDraft,
  }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({
    savePhoto: mocks.savePhoto,
    deletePhoto: mocks.deletePhoto,
    ready: true,
  }),
}));
vi.mock("@/hooks/useSafeSave", () => ({
  useSafeSave: () => ({ isSaving: false, run: (operation) => operation() }),
}));
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/utils/haptics", () => ({
  hapticSuccess: mocks.hapticSuccess,
  hapticWarning: mocks.hapticWarning,
}));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ notification }) =>
    notification ? <div role="alert">{notification.message}</div> : null,
}));
vi.mock("./components/AddLeakSuccess", () => ({
  default: ({ onNewLeak, onHome }) => (
    <div>
      <span>saved-success</span>
      <button onClick={onNewLeak}>new-leak</button>
      <button onClick={onHome}>home</button>
    </div>
  ),
}));
vi.mock("@/features/leakForm/LeakForm", () => ({
  default: ({ onAdd, onSaved }) => (
    <div>
      <button
        onClick={async () => {
          const saved = await onAdd(mocks.submittedRow);
          if (saved) onSaved(saved);
        }}
      >
        submit-leak
      </button>
    </div>
  ),
}));

function renderAddLeak(overrides = {}) {
  const props = {
    data: [],
    setData: vi.fn().mockResolvedValue(undefined),
    coords: { lat: 41.3, lng: 69.2 },
    setPage: vi.fn(),
    onBack: vi.fn(),
    userProfile: { name: "Inspector" },
    projectId: "project-a",
    ...overrides,
  };
  return { ...render(<AddLeak {...props} />), props };
}

describe("AddLeak orchestration", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.initialForm = {};
    mocks.submittedRow = { leak_id: "TAG-1", leak_speed: "2.5" };
    mocks.hasDraft.mockReset().mockReturnValue(false);
    mocks.loadDraft.mockReset().mockReturnValue(null);
    mocks.saveDraft.mockReset();
    mocks.clearDraft.mockReset();
    mocks.savePhoto.mockReset().mockResolvedValue("photos/leak.jpg");
    mocks.deletePhoto.mockReset().mockResolvedValue(undefined);
    mocks.hapticSuccess.mockReset();
    mocks.hapticWarning.mockReset();
    window.scrollTo = vi.fn();
  });

  it("persists a valid leak and renders the success state", async () => {
    const { props } = renderAddLeak();
    fireEvent.click(screen.getByText("submit-leak"));

    await waitFor(() => expect(props.setData).toHaveBeenCalledOnce());
    const saved = props.setData.mock.calls[0][0][0];
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(saved).toMatchObject({
      leak_id: "TAG-1",
      leak_speed: "2.5",
      lat: 41.3,
      lng: 69.2,
      status: "open",
      detectedBy: "Inspector",
    });
    expect(mocks.clearDraft).toHaveBeenCalled();
    expect(mocks.hapticSuccess).toHaveBeenCalled();
    expect(await screen.findByText("saved-success")).not.toBeNull();
  });

  it("blocks invalid coordinates before persistence", async () => {
    const { props } = renderAddLeak({ coords: { lat: 95, lng: 69.2 } });
    fireEvent.click(screen.getByText("submit-leak"));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(props.setData).not.toHaveBeenCalled();
    expect(mocks.hapticWarning).toHaveBeenCalled();
  });

  it("blocks saving when the user profile is empty", async () => {
    const { props } = renderAddLeak({ userProfile: { name: " " } });
    fireEvent.click(screen.getByText("submit-leak"));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(props.setData).not.toHaveBeenCalled();
  });

  it("rejects a duplicate leak tag before saving", async () => {
    const { props } = renderAddLeak({
      data: [{ id: "existing", leak_id: " tag-1 " }],
    });
    fireEvent.click(screen.getByText("submit-leak"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "A leak with this tag already exists",
    );
    expect(props.setData).not.toHaveBeenCalled();
    expect(mocks.savePhoto).not.toHaveBeenCalled();
  });

  it("does not persist a record when its photo cannot be saved", async () => {
    mocks.submittedRow = {
      leak_id: "TAG-2",
      leak_speed: "3",
      photo: { raw: new Blob(["photo"], { type: "image/jpeg" }) },
    };
    mocks.savePhoto.mockResolvedValue(null);
    const { props } = renderAddLeak();
    fireEvent.click(screen.getByText("submit-leak"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Failed to save the photo",
    );
    expect(props.setData).not.toHaveBeenCalled();
  });

  it("removes a newly saved photo when project persistence fails", async () => {
    mocks.submittedRow = {
      leak_id: "TAG-3",
      leak_speed: "4",
      photo: { raw: new Blob(["photo"], { type: "image/jpeg" }) },
    };
    const setData = vi.fn().mockRejectedValue(new Error("database locked"));
    renderAddLeak({ setData });
    mocks.clearDraft.mockClear();

    fireEvent.click(screen.getByText("submit-leak"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "database locked",
    );
    expect(mocks.deletePhoto).toHaveBeenCalledWith("photos/leak.jpg");
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  it("offers and restores an existing project draft", async () => {
    mocks.hasDraft.mockReturnValue(true);
    mocks.loadDraft.mockReturnValue({
      form: { station: "Draft station" },
      step: 2,
    });
    renderAddLeak();

    const restore = await screen.findByText("Restore");
    fireEvent.click(restore);

    expect(mocks.loadDraft).toHaveBeenCalled();
    expect(screen.queryByText("Restore")).toBeNull();
  });

  it("does not overwrite a stored draft before deciding restoration when defaults are non-empty", async () => {
    vi.useFakeTimers();
    mocks.initialForm = { leak_id: "", photo: null };
    mocks.hasDraft.mockReturnValue(true);
    mocks.loadDraft.mockReturnValue({
      form: { station: "Draft station" },
      step: 2,
    });

    renderAddLeak();

    expect(screen.getByText("Restore")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(mocks.saveDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Restore"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ station: "Draft station" }),
      1,
    );
  });

  it("does not create a draft from empty defaults and the derived inspector name", async () => {
    vi.useFakeTimers();
    mocks.initialForm = { leak_id: "", photo: null };
    renderAddLeak();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.clearDraft).toHaveBeenCalled();
  });

  it("removes a stored draft that contains only empty defaults", () => {
    mocks.initialForm = { leak_id: "", photo: null };
    mocks.loadDraft.mockReturnValue({
      form: {
        leak_id: "",
        photo: null,
        detectedBy: "Inspector",
      },
      step: 1,
    });

    renderAddLeak();

    expect(mocks.clearDraft).toHaveBeenCalled();
    expect(screen.queryByText("Restore")).toBeNull();
  });
});
