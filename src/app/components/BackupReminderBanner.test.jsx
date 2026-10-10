import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const project = vi.hoisted(() => ({ id: "p1" }));
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: project.id } }),
}));
vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: (key) => key, lang: "ru" }),
}));

const { default: BackupReminderBanner } =
  await import("./BackupReminderBanner");

const OLD = String(Date.now() - 30 * 24 * 60 * 60 * 1000);

beforeEach(() => localStorage.clear());

describe("BackupReminderBanner", () => {
  it("leads to the backup when the project has gone too long without one", () => {
    project.id = "p1";
    localStorage.setItem("app:p1:last_backup_at_v1", OLD);
    const onOpen = vi.fn();
    render(<BackupReminderBanner hasData onOpen={onOpen} />);

    fireEvent.click(screen.getByText("app.backupReminder.open"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("stays quiet after a recent backup", () => {
    localStorage.setItem("app:p2:last_backup_at_v1", String(Date.now()));
    const { container } = render(
      <BackupReminderBanner hasData onOpen={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides on «later» until the app restarts", () => {
    project.id = "p3";
    localStorage.setItem("app:p3:last_backup_at_v1", OLD);
    const first = render(<BackupReminderBanner hasData onOpen={() => {}} />);
    fireEvent.click(screen.getByText("app.backupReminder.later"));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    const second = render(<BackupReminderBanner hasData onOpen={() => {}} />);
    expect(second.container).toBeEmptyDOMElement();
  });
});
