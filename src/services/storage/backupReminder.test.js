import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_REMINDER_AFTER_MS,
  getBackupReminderState,
  markProjectBackedUp,
  readLastBackupAt,
} from "./backupReminder";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => localStorage.clear());

describe("backup reminder", () => {
  it("does not nag about an empty project", () => {
    expect(
      getBackupReminderState({ projectId: "p", hasData: false, now: 0 }),
    ).toMatchObject({ overdue: false, lastBackupAt: null });
  });

  // Только что заведённый проект не должен встречать человека упрёком:
  // отсчёт идёт с первого раза, когда в проекте увидели данные.
  it("counts a never-backed-up project from when data first appeared", () => {
    const start = 1_000 * DAY;
    expect(
      getBackupReminderState({ projectId: "p", hasData: true, now: start })
        .overdue,
    ).toBe(false);

    const later = getBackupReminderState({
      projectId: "p",
      hasData: true,
      now: start + BACKUP_REMINDER_AFTER_MS,
    });
    expect(later).toMatchObject({ overdue: true, daysWithoutBackup: 7 });
  });

  it("counts from the last backup once there is one", () => {
    markProjectBackedUp("p", 10 * DAY);

    expect(readLastBackupAt("p")).toBe(10 * DAY);
    expect(
      getBackupReminderState({ projectId: "p", hasData: true, now: 16 * DAY })
        .overdue,
    ).toBe(false);
    expect(
      getBackupReminderState({ projectId: "p", hasData: true, now: 18 * DAY }),
    ).toMatchObject({ overdue: true, daysWithoutBackup: 8 });
  });

  it("keeps projects apart", () => {
    markProjectBackedUp("a", 10 * DAY);
    expect(readLastBackupAt("b")).toBeNull();
  });
});
