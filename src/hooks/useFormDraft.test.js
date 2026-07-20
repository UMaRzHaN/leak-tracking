import { renderHook, act } from "@testing-library/react";
import { useFormDraft } from "./useFormDraft";

const DRAFT_KEY = "app:form_draft_v1";

beforeEach(() => {
  localStorage.clear();
});

describe("saveDraft / loadDraft", () => {
  it("saves and loads a draft", () => {
    const { result } = renderHook(() => useFormDraft());
    act(() => {
      result.current.saveDraft({ station: "A", leak_speed: 5 }, 2);
    });
    const draft = result.current.loadDraft();
    expect(draft.form.station).toBe("A");
    expect(draft.form.leak_speed).toBe(5);
    expect(draft.step).toBe(2);
  });

  it("strips photo.raw but keeps photo.src", () => {
    const { result } = renderHook(() => useFormDraft());
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
    const { result } = renderHook(() => useFormDraft());
    act(() => {
      result.current.saveDraft({ station: "C", photo: { raw: new Blob() } }, 1);
    });
    const draft = result.current.loadDraft();
    expect(draft.form.photo).toBeUndefined();
  });

  it("returns null when nothing saved", () => {
    const { result } = renderHook(() => useFormDraft());
    expect(result.current.loadDraft()).toBeNull();
  });

  it("ignores null/non-object form", () => {
    const { result } = renderHook(() => useFormDraft());
    act(() => {
      result.current.saveDraft(null, 1);
    });
    expect(result.current.loadDraft()).toBeNull();
  });
});

describe("hasDraft", () => {
  it("returns false when nothing is saved", () => {
    const { result } = renderHook(() => useFormDraft());
    expect(result.current.hasDraft()).toBe(false);
  });

  it("returns true after saving", () => {
    const { result } = renderHook(() => useFormDraft());
    act(() => {
      result.current.saveDraft({ x: 1 }, 1);
    });
    expect(result.current.hasDraft()).toBe(true);
  });

  it("removes expired and corrupted drafts without showing a restore prompt", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ form: { x: 1 }, savedAt: Date.now() - 90_000_000 }),
    );
    const { result } = renderHook(() => useFormDraft());

    expect(result.current.hasDraft()).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    localStorage.setItem(DRAFT_KEY, "{broken");
    expect(result.current.hasDraft()).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("rejects drafts whose form is not an object", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ form: "broken", savedAt: Date.now() }),
    );
    const { result } = renderHook(() => useFormDraft());

    expect(result.current.hasDraft()).toBe(false);
    expect(result.current.loadDraft()).toBeNull();
  });
});

describe("clearDraft", () => {
  it("removes the draft from localStorage", () => {
    const { result } = renderHook(() => useFormDraft());
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
      savedAt: Date.now() - 90_000_000, // 25 часов назад
    });
    localStorage.setItem(DRAFT_KEY, expired);

    const { result } = renderHook(() => useFormDraft());
    expect(result.current.loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns draft when savedAt is within TTL", () => {
    const fresh = JSON.stringify({
      form: { station: "Y" },
      step: 3,
      savedAt: Date.now() - 60_000, // 1 минута назад
    });
    localStorage.setItem(DRAFT_KEY, fresh);

    const { result } = renderHook(() => useFormDraft());
    const draft = result.current.loadDraft();
    expect(draft).not.toBeNull();
    expect(draft.form.station).toBe("Y");
  });
});

describe("corrupted storage", () => {
  it("handles invalid JSON gracefully", () => {
    localStorage.setItem(DRAFT_KEY, "not-json{{");
    const { result } = renderHook(() => useFormDraft());
    expect(result.current.loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
