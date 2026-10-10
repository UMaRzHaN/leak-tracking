import { renderHook, act } from "@testing-library/react";
import { useFormDraft } from "./useFormDraft";

const PROJECT_ID = "project-a";
const DRAFT_KEY = `app:${PROJECT_ID}:form_draft_v2`;
const renderDraftHook = (projectId = PROJECT_ID) =>
  renderHook(() => useFormDraft(projectId));

beforeEach(() => {
  localStorage.clear();
});

describe("saveDraft / loadDraft", () => {
  it("saves and loads a draft", () => {
    const { result } = renderDraftHook();
    act(() => {
      result.current.saveDraft({ station: "A", leak_speed: 5 }, 2);
    });
    const draft = result.current.loadDraft();
    expect(draft.form.station).toBe("A");
    expect(draft.form.leak_speed).toBe(5);
    expect(draft.step).toBe(2);
  });

  it("strips photo.raw but keeps photo.src", () => {
    const { result } = renderDraftHook();
    act(() => {
      result.current.saveDraft(
        {
          station: "B",
          photo: { raw: new Blob(), src: "data:image/jpeg;base64,abc" },
        },
        1,
      );
    });
    const draft = result.current.loadDraft();
    expect(draft.form.photo.src).toBe("data:image/jpeg;base64,abc");
    expect(draft.form.photo.raw).toBeUndefined();
  });

  it("omits photo entirely when it has no src", () => {
    const { result } = renderDraftHook();
    act(() => {
      result.current.saveDraft({ station: "C", photo: { raw: new Blob() } }, 1);
    });
    const draft = result.current.loadDraft();
    expect(draft.form.photo).toBeUndefined();
  });

  it("returns null when nothing saved", () => {
    const { result } = renderDraftHook();
    expect(result.current.loadDraft()).toBeNull();
  });

  it("ignores null/non-object form", () => {
    const { result } = renderDraftHook();
    act(() => {
      result.current.saveDraft(null, 1);
    });
    expect(result.current.loadDraft()).toBeNull();
  });
});

describe("hasDraft", () => {
  it("returns false when nothing is saved", () => {
    const { result } = renderDraftHook();
    expect(result.current.hasDraft()).toBe(false);
  });

  it("returns true after saving", () => {
    const { result } = renderDraftHook();
    act(() => {
      result.current.saveDraft({ x: 1 }, 1);
    });
    expect(result.current.hasDraft()).toBe(true);
  });

  it("removes expired and corrupted drafts without showing a restore prompt", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        projectId: PROJECT_ID,
        form: { x: 1 },
        savedAt: Date.now() - 8 * 86_400_000,
      }),
    );
    const { result } = renderDraftHook();

    expect(result.current.hasDraft()).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    localStorage.setItem(DRAFT_KEY, "{broken");
    expect(result.current.hasDraft()).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("rejects drafts whose form is not an object", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        projectId: PROJECT_ID,
        form: "broken",
        savedAt: Date.now(),
      }),
    );
    const { result } = renderDraftHook();

    expect(result.current.hasDraft()).toBe(false);
    expect(result.current.loadDraft()).toBeNull();
  });
});

describe("clearDraft", () => {
  it("removes the draft from localStorage", () => {
    const { result } = renderDraftHook();
    act(() => {
      result.current.saveDraft({ x: 1 }, 1);
    });
    act(() => {
      result.current.clearDraft();
    });
    expect(result.current.hasDraft()).toBe(false);
    expect(result.current.loadDraft()).toBeNull();
  });
});

describe("TTL expiry", () => {
  it("returns null and removes draft when savedAt is expired", () => {
    const expired = JSON.stringify({
      form: { station: "X" },
      step: 1,
      projectId: PROJECT_ID,
      savedAt: Date.now() - 8 * 86_400_000, // 8 дней назад
    });
    localStorage.setItem(DRAFT_KEY, expired);

    const { result } = renderDraftHook();
    expect(result.current.loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns draft when savedAt is within TTL", () => {
    const fresh = JSON.stringify({
      form: { station: "Y" },
      step: 3,
      projectId: PROJECT_ID,
      savedAt: Date.now() - 3 * 86_400_000, // 3 дня назад
    });
    localStorage.setItem(DRAFT_KEY, fresh);

    const { result } = renderDraftHook();
    const draft = result.current.loadDraft();
    expect(draft).not.toBeNull();
    expect(draft.form.station).toBe("Y");
  });
});

describe("storage quota", () => {
  it("keeps the typed fields when the photo does not fit", () => {
    const { result } = renderDraftHook();
    const setItem = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (String(value).includes("data:image/")) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        return setItem.call(this, key, value);
      });

    act(() => {
      result.current.saveDraft(
        { station: "Q", photo: { src: "data:image/jpeg;base64,big" } },
        2,
      );
    });
    spy.mockRestore();

    const draft = result.current.loadDraft();
    expect(draft.form.station).toBe("Q");
    expect(draft.form.photo).toBeUndefined();
    expect(draft.step).toBe(2);
  });
});

describe("corrupted storage", () => {
  it("handles invalid JSON gracefully", () => {
    localStorage.setItem(DRAFT_KEY, "not-json{{");
    const { result } = renderDraftHook();
    expect(result.current.loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("project isolation", () => {
  it("does not expose one project's draft to another project", () => {
    const { result: projectA } = renderDraftHook("project-a");
    act(() => projectA.current.saveDraft({ station: "A" }, 2));

    const { result: projectB } = renderDraftHook("project-b");
    expect(projectB.current.hasDraft()).toBe(false);
    expect(projectB.current.loadDraft()).toBeNull();
    expect(projectA.current.loadDraft()?.form.station).toBe("A");
  });

  it("does not persist a draft until a project is selected", () => {
    const { result } = renderDraftHook(null);
    act(() => result.current.saveDraft({ station: "A" }, 1));

    expect(result.current.hasDraft()).toBe(false);
    expect(result.current.loadDraft()).toBeNull();
  });

  it("removes the unsafe legacy global draft when saving", () => {
    localStorage.setItem(
      "app:form_draft_v1",
      JSON.stringify({ form: { station: "legacy" }, savedAt: Date.now() }),
    );
    const { result } = renderDraftHook();

    act(() => result.current.saveDraft({ station: "current" }, 1));

    expect(localStorage.getItem("app:form_draft_v1")).toBeNull();
    expect(result.current.loadDraft()?.form.station).toBe("current");
  });
});
describe("legacy draft migration", () => {
  it("claims a valid v1 draft for the active project", () => {
    localStorage.setItem(
      "app:form_draft_v1",
      JSON.stringify({
        form: { station: "legacy" },
        step: 2,
        savedAt: Date.now(),
      }),
    );
    const { result } = renderDraftHook();

    expect(result.current.hasDraft()).toBe(true);
    expect(result.current.loadDraft()).toEqual({
      form: { station: "legacy" },
      step: 2,
    });
    expect(localStorage.getItem("app:form_draft_v1")).toBeNull();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).projectId).toBe(
      PROJECT_ID,
    );
  });

  it("removes an expired v1 draft without migrating it", () => {
    localStorage.setItem(
      "app:form_draft_v1",
      JSON.stringify({
        form: { station: "old" },
        savedAt: Date.now() - 8 * 86_400_000,
      }),
    );
    const { result } = renderDraftHook();

    expect(result.current.hasDraft()).toBe(false);
    expect(localStorage.getItem("app:form_draft_v1")).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
