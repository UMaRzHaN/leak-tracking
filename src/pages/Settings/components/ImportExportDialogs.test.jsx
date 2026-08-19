import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: translate }),
}));
vi.mock("@/features/importConflict/ImportConflictSheet", () => ({
  default: ({ open, projectName, sourceLabel, onCancel }) =>
    open ? (
      <div>
        <span>
          conflict:{sourceLabel ?? "backup"}:{projectName}
        </span>
        <button onClick={onCancel}>cancel-{sourceLabel ?? "backup"}</button>
      </div>
    ) : null,
}));
vi.mock("@/components/ui/ConfirmSheet/ConfirmSheet", () => ({
  default: ({ open, title, description, onConfirm, onCancel }) =>
    open ? (
      <div>
        <span>desc:{description}</span>
        <button onClick={onConfirm}>confirm:{title}</button>
        <button onClick={onCancel}>cancel:{title}</button>
      </div>
    ) : null,
}));

import ImportExportDialogs from "./ImportExportDialogs";

function props(overrides = {}) {
  return {
    backupConflict: {
      state: { open: false },
      onOverwrite: vi.fn(),
      onMerge: vi.fn(),
      onCopy: vi.fn(),
      onCancel: vi.fn(),
      ...overrides.backupConflict,
    },
    excelConflict: {
      state: { open: false },
      onOverwrite: vi.fn(),
      onMerge: vi.fn(),
      onCopy: vi.fn(),
      onCancel: vi.fn(),
      ...overrides.excelConflict,
    },
    excelImport: {
      state: { open: false },
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      ...overrides.excelImport,
    },
    importConfirm: {
      state: { open: false },
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      ...overrides.importConfirm,
    },
  };
}

describe("ImportExportDialogs", () => {
  it("renders nothing while every dialog is closed", () => {
    const { container } = render(<ImportExportDialogs {...props()} />);

    expect(container.textContent).toBe("");
  });

  it("keeps the two conflict sheets apart by their source labels", () => {
    const p = props({
      backupConflict: { state: { open: true, resolvedName: "Alpha" } },
      excelConflict: { state: { open: true, projectName: "Beta" } },
    });
    render(<ImportExportDialogs {...p} />);

    expect(screen.getByText("conflict:backup:Alpha")).toBeTruthy();
    expect(screen.getByText("conflict:in Excel:Beta")).toBeTruthy();

    fireEvent.click(screen.getByText("cancel-backup"));
    fireEvent.click(screen.getByText("cancel-in Excel"));

    expect(p.backupConflict.onCancel).toHaveBeenCalled();
    expect(p.excelConflict.onCancel).toHaveBeenCalled();
  });

  it("passes the interrupted-import confirmation straight through", () => {
    const p = props({
      importConfirm: {
        state: {
          open: true,
          title: "Finish import?",
          description: "It stopped halfway.",
        },
      },
    });
    render(<ImportExportDialogs {...p} />);

    fireEvent.click(screen.getByText("confirm:Finish import?"));
    fireEvent.click(screen.getByText("cancel:Finish import?"));

    expect(p.importConfirm.onConfirm).toHaveBeenCalled();
    expect(p.importConfirm.onCancel).toHaveBeenCalled();
  });

  it("summarises what an Excel import is about to do", () => {
    const p = props({
      excelImport: {
        state: {
          open: true,
          fileName: "leaks.xlsx",
          result: {
            sheetName: "Leaks",
            stats: {
              totalRows: 10,
              imported: 8,
              monitoringRecords: 2,
              restoredPhotos: 3,
              skipped: 2,
              validationWarningCount: 0,
            },
          },
        },
      },
    });
    render(<ImportExportDialogs {...p} />);

    const description = screen.getByText(/^desc:/).textContent;
    expect(description).toContain("leaks.xlsx");
    expect(description).toContain("Leaks");
    expect(description).toContain("to import: 8");
    expect(description).toContain("monitoring: 2");
    expect(description).toContain("photos: 3");
    // Без замечаний хвост про них не приписывается.
    expect(description).not.toContain("Validation warnings");
  });

  // Замечания валидатора показываются числом и тремя примерами: полный список
  // в диалог не помещается, а без примеров число ни о чём не говорит.
  it("lists at most three validation warnings after their count", () => {
    const warning = (row) => ({
      sheet: "Leaks",
      row,
      column: "pressure",
      message: "not a number",
    });
    const p = props({
      excelImport: {
        state: {
          open: true,
          fileName: "leaks.xlsx",
          result: {
            sheetName: "Leaks",
            stats: {
              totalRows: 10,
              imported: 6,
              skipped: 4,
              validationWarningCount: 4,
              validationWarnings: [2, 3, 4, 5].map(warning),
            },
          },
        },
      },
    });
    render(<ImportExportDialogs {...p} />);

    const description = screen.getByText(/^desc:/).textContent;
    expect(description).toContain("Validation warnings: 4.");
    expect(description).toContain("Leaks, row 2, pressure: not a number");
    expect(description).toContain("Leaks, row 4, pressure: not a number");
    expect(description).not.toContain("row 5");
    // Счётчики, которых нет в статистике, показываются нулями, а не "undefined".
    expect(description).toContain("monitoring: 0");
    expect(description).toContain("photos: 0");
  });

  it("shows the count alone when the warnings themselves are missing", () => {
    const p = props({
      excelImport: {
        state: {
          open: true,
          fileName: "leaks.xlsx",
          result: {
            sheetName: "Leaks",
            stats: {
              totalRows: 1,
              imported: 0,
              skipped: 1,
              validationWarningCount: 2,
            },
          },
        },
      },
    });
    render(<ImportExportDialogs {...p} />);

    expect(screen.getByText(/^desc:/).textContent).toContain(
      "Validation warnings: 2.",
    );
  });

  it("leaves the description empty until the workbook is parsed", () => {
    const p = props({ excelImport: { state: { open: true, result: null } } });
    render(<ImportExportDialogs {...p} />);

    expect(screen.getByText(/^desc:/).textContent).toBe("desc:");
  });
});
