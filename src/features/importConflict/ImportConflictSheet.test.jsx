import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportConflictSheet from "./ImportConflictSheet";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

describe("ImportConflictSheet content", () => {
  it("renders the conflict, the merge preview and the photo diagnostics", () => {
    render(
      <ImportConflictSheet
        open
        projectName="Project A"
        existingProject={{ leakCount: 1 }}
        leakCount={3}
        mergePreview={{
          added: 2,
          updated: 1,
          skipped: 0,
          changedFields: 4,
          changedFieldBreakdown: { monitoringRecords: 3, history: 1 },
          photoStats: {
            added: 5,
            replaced: 2,
            reused: 1,
            replacedByField: { photo: 2 },
            replacedByReason: { unreadable: 1, different: 1 },
          },
        }}
        onOverwrite={vi.fn()}
        onMerge={vi.fn()}
        onCopy={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading").textContent).toBe(
      "Project already exists",
    );
    // Interpolation, and the singular plural form for a single record.
    expect(screen.getByRole("dialog").textContent).toContain(
      '"Project A" already exists in the app',
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "1 record → 3 in archive",
    );

    for (const label of [
      "Added",
      "Updated",
      "Skipped",
      "New photos",
      "Replaced photos",
      "Reused photos",
      "Changed fields",
      "Difference details",
      "Monitoring history: 3",
      "Change history: 1",
      "photo photo: 2",
      "local photo could not be read: 1",
      "photo content differs: 1",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("falls back to the archive photo label when there are no photo stats", () => {
    render(
      <ImportConflictSheet
        open
        projectName="Project A"
        existingProject={{ leakCount: 4 }}
        leakCount={3}
        mergePreview={{ added: 0, updated: 0, skipped: 0, archivePhotos: 7 }}
        onOverwrite={vi.fn()}
        onMerge={vi.fn()}
        onCopy={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Archive photos")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("4 records");
  });
});

describe("ImportConflictSheet async actions", () => {
  it("allows only one import action and blocks closing while it is pending", async () => {
    let finish;
    const onMerge = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(
      <ImportConflictSheet
        open
        projectName="Project A"
        existingProject={{ leakCount: 2 }}
        leakCount={3}
        onOverwrite={vi.fn()}
        onMerge={onMerge}
        onCopy={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    expect(onMerge).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Merge" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      finish();
    });

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Merge" }).disabled).toBe(false);
  });
});

describe("ImportConflictSheet registry preview", () => {
  const base = {
    open: true,
    projectName: "Project A",
    existingProject: { leakCount: 0 },
    leakCount: 0,
    mergePreview: { added: 0, updated: 0, skipped: 0, archivePhotos: 0 },
  };

  it("shows what the archive does to the component registry", () => {
    // Иначе архив с полутора десятками карточек и без единой утечки выглядит
    // рядом нулей, и человек решает его судьбу вслепую.
    render(
      <ImportConflictSheet
        {...base}
        registryPreview={{ added: 12, updated: 3, total: 15, photos: 9 }}
      />,
    );

    expect(screen.getByText("Components added")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Components updated")).toBeInTheDocument();
    expect(screen.getByText("Component photos")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("says nothing about a registry the archive does not carry", () => {
    render(<ImportConflictSheet {...base} registryPreview={null} />);

    expect(screen.queryByText("Components added")).not.toBeInTheDocument();
    expect(screen.queryByText("Component photos")).not.toBeInTheDocument();
  });
  it("говорит и о том, что архив унесёт", () => {
    // Архив с соседнего телефона везёт не только карточки, но и записи об
    // удалённых. Ряд «добавится 0, обновится 0» скрывал бы, что двенадцать
    // карточек сейчас уйдут.
    render(
      <ImportConflictSheet
        {...base}
        registryPreview={{
          added: 0,
          updated: 0,
          removed: 12,
          total: 0,
          photos: 0,
        }}
      />,
    );

    expect(screen.getByText("Components removed")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("молчит об удалении, которого в архиве нет", () => {
    render(
      <ImportConflictSheet
        {...base}
        registryPreview={{
          added: 1,
          updated: 0,
          removed: 0,
          total: 1,
          photos: 0,
        }}
      />,
    );

    expect(screen.queryByText("Components removed")).not.toBeInTheDocument();
  });
});
