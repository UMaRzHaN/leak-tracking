import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

/* ── Mocks ────────────────────────────────────────────────────────────────── */

// Keep isNative = false so we exercise the localStorage (web) code path.
vi.mock("@/utils/platform", () => ({
  isNative: false,
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  Directory: { Data: "DATA" },
}));

/* ── Import after mocks ───────────────────────────────────────────────────── */
const { LeakRepository, getPreservedInvalidLeakRecords } =
  await import("./LeakRepository");

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const PROJECT = { projectId: "proj-1", folderName: "test_project" };

const makeLeak = (overrides = {}) => ({
  id: `leak-${Math.random().toString(36).slice(2)}`,
  lat: 55.0,
  lng: 73.0,
  status: "open",
  ...overrides,
});

function storageKey(projectId) {
  return `app:${projectId}:data_v1`;
}

/* ── Setup ────────────────────────────────────────────────────────────────── */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe("LeakRepository.getAll (web / localStorage)", () => {
  it("returns empty array when store is empty", async () => {
    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toEqual([]);
  });

  it("returns all leaks previously saved via saveAll", async () => {
    const leaks = [makeLeak({ id: "l1" }), makeLeak({ id: "l2" })];
    await LeakRepository.saveAll(leaks, PROJECT);

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("filters out records that fail schema validation", async () => {
    const valid = makeLeak({ id: "valid-1" });
    // Missing required 'id' field — will be discarded by filterValidLeaks
    const invalid = { lat: 55, lng: 73, status: "open" };
    localStorage.setItem(
      storageKey(PROJECT.projectId),
      JSON.stringify([valid, invalid]),
    );

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("valid-1");
    expect(getPreservedInvalidLeakRecords(result)).toEqual([invalid]);
  });

  it("rejects corrupted localStorage instead of reporting an empty project", async () => {
    localStorage.setItem(storageKey(PROJECT.projectId), "not-json{{");
    await expect(LeakRepository.getAll(PROJECT)).rejects.toMatchObject({
      code: "PROJECT_DATA_READ_FAILED",
    });
  });

  it("applies default status='open' for records missing the field", async () => {
    const leak = { id: "x", lat: 55, lng: 73 };
    localStorage.setItem(storageKey(PROJECT.projectId), JSON.stringify([leak]));
    const result = await LeakRepository.getAll(PROJECT);
    expect(result[0].status).toBe("open");
  });

  it("filters out records with unsupported status", async () => {
    localStorage.setItem(
      storageKey(PROJECT.projectId),
      JSON.stringify([{ id: "bad-status", status: "closed" }]),
    );

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toEqual([]);
  });

  it("filters out records with invalid photo paths", async () => {
    localStorage.setItem(
      storageKey(PROJECT.projectId),
      JSON.stringify([
        { id: "bad-photo", status: "open", photo: "/tmp/photo.jpg" },
      ]),
    );

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toEqual([]);
  });
});

describe("LeakRepository.saveAll (web / localStorage)", () => {
  it("persists leaks to localStorage", async () => {
    const leaks = [makeLeak({ id: "s1" })];
    await LeakRepository.saveAll(leaks, PROJECT);

    const raw = localStorage.getItem(storageKey(PROJECT.projectId));
    expect(JSON.parse(raw)).toHaveLength(1);
    expect(JSON.parse(raw)[0].id).toBe("s1");
  });

  it("overwrites a previous saveAll call (full replace, not merge)", async () => {
    await LeakRepository.saveAll([makeLeak({ id: "old" })], PROJECT);
    await LeakRepository.saveAll(
      [makeLeak({ id: "new-1" }), makeLeak({ id: "new-2" })],
      PROJECT,
    );

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.id)).toEqual(["new-1", "new-2"]);
  });

  it("saveAll + getAll round-trip preserves all leak fields", async () => {
    const leak = makeLeak({
      id: "rt-1",
      leak_id: "LK-001",
      component: "Кран Шаровой",
      leak_speed: 5.3,
      priority: "high",
    });
    await LeakRepository.saveAll([leak], PROJECT);
    const [restored] = await LeakRepository.getAll(PROJECT);

    expect(restored.leak_id).toBe("LK-001");
    expect(restored.component).toBe("Кран Шаровой");
    expect(restored.leak_speed).toBe(5.3);
    expect(restored.priority).toBe("high");
  });

  it("saveAll with empty array clears the project data", async () => {
    await LeakRepository.saveAll([makeLeak()], PROJECT);
    await LeakRepository.saveAll([], PROJECT);

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toEqual([]);
  });

  it("isolates data between different projects", async () => {
    const projectA = { projectId: "proj-a", folderName: "folder_a" };
    const projectB = { projectId: "proj-b", folderName: "folder_b" };

    await LeakRepository.saveAll([makeLeak({ id: "a1" })], projectA);
    await LeakRepository.saveAll(
      [makeLeak({ id: "b1" }), makeLeak({ id: "b2" })],
      projectB,
    );

    expect(await LeakRepository.getAll(projectA)).toHaveLength(1);
    expect(await LeakRepository.getAll(projectB)).toHaveLength(2);
  });
});

describe("LeakRepository.clear (web / localStorage)", () => {
  it("removes all leaks for the project", async () => {
    await LeakRepository.saveAll([makeLeak(), makeLeak()], PROJECT);
    await LeakRepository.clear(PROJECT);

    const result = await LeakRepository.getAll(PROJECT);
    expect(result).toEqual([]);
  });

  it("is a no-op when store is already empty", async () => {
    await expect(LeakRepository.clear(PROJECT)).resolves.not.toThrow();
    expect(await LeakRepository.getAll(PROJECT)).toEqual([]);
  });

  it("does not clear data from other projects", async () => {
    const other = { projectId: "proj-other", folderName: "other" };
    await LeakRepository.saveAll([makeLeak({ id: "o1" })], other);
    await LeakRepository.clear(PROJECT);

    expect(await LeakRepository.getAll(other)).toHaveLength(1);
  });
});
