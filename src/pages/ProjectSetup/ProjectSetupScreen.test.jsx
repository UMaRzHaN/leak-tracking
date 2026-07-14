import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProjectSetupScreen from "./ProjectSetupScreen";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    toggleLanguage: vi.fn(),
    t: (key, options) =>
      ({
        "projectSetup.title": "Leak Tracking",
        "projectSetup.subtitle": "Create your first project",
        "projectSetup.projectName": "Project Name",
        "projectSetup.projectType": "Project Type",
        "projectSetup.projectExample": "Example",
        "projectSetup.deviceFolder": "Device folder",
        "projectSetup.selectProjectType": "Select project type",
        "projectSetup.start": "Start",
        "projectSetup.or": "or",
        "projectSetup.import": "Import from ZIP",
        "projectSetup.importing": "Importing...",
        "projectSetup.importExcel": "Import Excel",
        "projectSetup.importingExcel": "Importing Excel...",
        "projectSetup.importExcelProgress":
          "Reading the Excel archive, please wait...",
        "projectSetup.emptyExcel": "No importable rows found in Excel",
        "projectSetup.importHint": "Restore a project from a backup",
        "projectSetup.importError": "Import error",
        "projectSetup.languageToggle": "RU",
        "projectSetup.projectTypes.upstream.title": "Upstream",
        "projectSetup.projectTypes.upstream.description": "Production",
        "projectSetup.projectTypes.midstream.title": "Midstream",
        "projectSetup.projectTypes.midstream.description": "Transportation",
        "projectSetup.projectTypes.downstream.title": "Downstream",
        "projectSetup.projectTypes.downstream.description": "Processing",
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}));

vi.mock("@/services/projectBackupService", () => ({
  peekBackupZip: vi.fn().mockResolvedValue({
    leaks: [],
    meta: { project: { name: "Imported", type: "upstream" } },
    detectedType: "upstream",
  }),
}));

describe("ProjectSetupScreen", () => {
  it("shows an import progress notice while importing zip into an empty app", async () => {
    const onImportZip = vi.fn(() => new Promise(() => {}));
    const { container } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={onImportZip} />,
    );

    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: {
        files: [new File(["zip"], "backup.zip", { type: "application/zip" })],
      },
    });

    expect((await screen.findByRole("status")).textContent).toContain(
      "ZIP backup import in progress, please wait...",
    );
  });

  it("imports an Excel archive into a new project after selecting its type", async () => {
    const onImportExcel = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportExcel={onImportExcel}
      />,
    );

    fireEvent.click(screen.getByText("Midstream"));
    const input = container.querySelector('input[accept^=".xlsx"]');
    const file = new File(["zip"], "inspection.zip", {
      type: "application/zip",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onImportExcel).toHaveBeenCalledWith(file, {
        name: "inspection",
        type: "midstream",
      }),
    );
  });

  it("allows selecting an Excel ZIP archive before choosing a project type", async () => {
    const onImportExcel = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportExcel={onImportExcel}
      />,
    );

    const input = container.querySelector('input[accept^=".xlsx"]');
    const file = new File(["zip"], "project.zip", {
      type: "application/zip",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onImportExcel).toHaveBeenCalledWith(file, {
        name: "project",
        type: "",
      }),
    );
  });
});
