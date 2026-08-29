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
  photoReady: true,
  photoStorageError: null,
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
    ready: mocks.photoReady,
    storageError: mocks.photoStorageError,
  }),
}));
// useSafeSave is deliberately NOT mocked. Its re-entry guard is the thing that
// stops a second tap from filing a second leak, and a stub that just calls the
// operation reports success while the guard is gone — which is exactly how the
// double-save regression reached a phone unnoticed.
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
  default: ({ onAdd, onSaved, lastItem }) => (
    <div>
      <button
        onClick={async () => {
          const saved = await onAdd(mocks.submittedRow);
          if (saved) onSaved(saved);
        }}
      >
        submit-leak
      </button>
      {/* Форма показывает значения этой записи серым в пустых полях. */}
      <span data-testid="last-item">{lastItem?.id ?? "нет"}</span>
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
    mocks.photoReady = true;
    mocks.photoStorageError = null;
    mocks.hapticSuccess.mockReset();
    mocks.hapticWarning.mockReset();
    window.scrollTo = vi.fn();
  });

  describe("запись, с которой берутся подсказки", () => {
    // Лист Excel пишется в том порядке, в каком его показывает база — от новых
    // к старым, — а импорт порядок листа сохраняет. Поэтому в конце массива
    // после импорта лежит самая старая запись, и `data[data.length - 1]`
    // предлагал подсказки из неё.
    const older = { id: "старая", createdAt: 1_000, object: "старый объект" };
    const newer = { id: "новая", createdAt: 5_000, object: "новый объект" };

    it("берёт самую свежую, а не последнюю в массиве", () => {
      renderAddLeak({ data: [newer, older] });

      expect(screen.getByTestId("last-item")).toHaveTextContent("новая");
    });

    it("не зависит от порядка хранения", () => {
      renderAddLeak({ data: [older, newer] });

      expect(screen.getByTestId("last-item")).toHaveTextContent("новая");
    });

    it("на пустом проекте подсказок нет", () => {
      renderAddLeak({ data: [] });

      expect(screen.getByTestId("last-item")).toHaveTextContent("нет");
    });
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

  it("shows why photo storage failed instead of a generic retry notice", async () => {
    // The reason used to stay in storageError, so a permanent mkdir failure
    // looked like a transient "try again in a second" timeout.
    mocks.photoReady = false;
    mocks.photoStorageError = {
      message: "Directory at '/data/.../photos/' already exists.",
      code: "OS-PLUG-FILE-0010",
    };
    mocks.submittedRow = {
      ...mocks.submittedRow,
      photo: { raw: new Blob(["photo"], { type: "image/jpeg" }) },
    };

    const { props } = renderAddLeak();
    fireEvent.click(screen.getByText("submit-leak"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Photo storage is unavailable: Directory at '/data/.../photos/' already exists. (OS-PLUG-FILE-0010)",
    );
    expect(props.setData).not.toHaveBeenCalled();
    expect(mocks.savePhoto).not.toHaveBeenCalled();
    expect(mocks.hapticWarning).toHaveBeenCalled();
  });

  it("keeps the retry notice while photo storage is still initializing", async () => {
    mocks.photoReady = false;
    mocks.photoStorageError = null;
    mocks.submittedRow = {
      ...mocks.submittedRow,
      photo: { raw: new Blob(["photo"], { type: "image/jpeg" }) },
    };

    const { props } = renderAddLeak();
    fireEvent.click(screen.getByText("submit-leak"));

    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toBe(
      "Photo is not ready for saving yet. Try again in a second.",
    );
    expect(props.setData).not.toHaveBeenCalled();
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

  // A leak without coordinates is dropped from the map, and it used to be saved
  // that way silently. Now the receiver is switched on instead of the user
  // being asked.
  describe("saving without coordinates", () => {
    const noCoords = { coords: { lat: null, lng: null } };

    it("switches GPS on instead of asking", async () => {
      const setGpsEnabled = vi.fn();
      renderAddLeak({ ...noCoords, gpsEnabled: false, setGpsEnabled });
      fireEvent.click(screen.getByText("submit-leak"));

      await waitFor(() => expect(setGpsEnabled).toHaveBeenCalledWith(true));
    });

    it("saves with the fix once the receiver reports one", async () => {
      const { props, rerender } = renderAddLeak({
        ...noCoords,
        gpsEnabled: false,
        setGpsEnabled: vi.fn(),
      });
      fireEvent.click(screen.getByText("submit-leak"));

      // The watch reports a position while the save is still waiting.
      await act(async () => {
        rerender(<AddLeak {...props} coords={{ lat: 41.3, lng: 69.2 }} />);
      });

      await waitFor(() => expect(props.setData).toHaveBeenCalledOnce());
      expect(props.setData.mock.calls[0][0][0]).toMatchObject({
        lat: 41.3,
        lng: 69.2,
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("leaves GPS alone when it is already on", async () => {
      const setGpsEnabled = vi.fn();
      const { props, rerender } = renderAddLeak({
        ...noCoords,
        gpsEnabled: true,
        setGpsEnabled,
      });
      fireEvent.click(screen.getByText("submit-leak"));
      await act(async () => {
        rerender(<AddLeak {...props} coords={{ lat: 41.3, lng: 69.2 }} />);
      });

      await waitFor(() => expect(props.setData).toHaveBeenCalledOnce());
      expect(setGpsEnabled).not.toHaveBeenCalled();
    });

    // Underground the wait always expires. The leak still has to be saved —
    // losing a filled-in form because there is no sky would be worse.
    it("still saves and says so when no fix ever arrives", async () => {
      vi.useFakeTimers();
      const { props } = renderAddLeak({
        ...noCoords,
        gpsEnabled: false,
        setGpsEnabled: vi.fn(),
      });
      fireEvent.click(screen.getByText("submit-leak"));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16000);
      });

      expect(props.setData).toHaveBeenCalledOnce();
      expect(props.setData.mock.calls[0][0][0]).toMatchObject({
        lat: null,
        lng: null,
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        /saved without coordinates/i,
      );
      vi.useRealTimers();
    });

    // The wait used to sit outside `run`, so isSaving stayed false and the Save
    // button stayed live: it got tapped again, and each tap opened its own wait.
    // Two waits ending apart each reached the save and filed the leak twice.
    it("files one leak however many times Save is tapped during the wait", async () => {
      vi.useFakeTimers();
      const { props } = renderAddLeak({
        ...noCoords,
        gpsEnabled: false,
        setGpsEnabled: vi.fn(),
      });

      const button = screen.getByText("submit-leak");
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16000);
      });

      expect(props.setData).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it("does not wait at all when coordinates are already known", async () => {
      const setGpsEnabled = vi.fn();
      const { props } = renderAddLeak({ setGpsEnabled });
      fireEvent.click(screen.getByText("submit-leak"));

      await waitFor(() => expect(props.setData).toHaveBeenCalledOnce());
      expect(setGpsEnabled).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
