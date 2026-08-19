import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const mocks = vi.hoisted(() => ({
  loadComponents: vi.fn(),
  listSchemas: vi.fn(),
  readSchemaFile: vi.fn(),
}));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.loadComponents, save: vi.fn() },
}));
vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: {
    listSchemas: mocks.listSchemas,
    readSchemaFile: mocks.readSchemaFile,
  },
}));
vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: { save: vi.fn() },
}));
vi.mock("@/hooks/photoService", () => ({ getPhotoSrc: vi.fn() }));

const { buildProjectBackupZip } = await import("./backupExport");

const project = {
  id: "p1",
  name: "Бузахур",
  type: "upstream",
  folderName: "b",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadComponents.mockResolvedValue([]);
  mocks.listSchemas.mockResolvedValue([]);
});

describe("what a ZIP backup carries besides the leaks", () => {
  it("takes the registry, its photographs and the drawings along", async () => {
    // A project handed over on a backup used to arrive with the leaks intact
    // and the whole equipment walk missing, with nothing saying so.
    mocks.loadComponents.mockResolvedValue([
      { id: "c1", component_uid: "4242", photo: "idb://photo_c1" },
    ]);
    mocks.listSchemas.mockResolvedValue([{ id: "s1", name: "узел.pdf" }]);
    mocks.readSchemaFile.mockResolvedValue(new Blob(["pdf"]));

    const blob = await buildProjectBackupZip({
      leaks: [],
      idbGet: async () => new Blob(["x"], { type: "image/jpeg" }),
      project,
      vars: null,
    });

    const names = Object.keys((await new JSZip().loadAsync(blob)).files);
    expect(names).toContain("components.json");
    expect(names).toContain("component_photos/4242.jpg");
    expect(names).toContain("technological_schemas/узел.pdf");
  });

  it("still produces a backup when the registry cannot be read", async () => {
    mocks.loadComponents.mockRejectedValue(new Error("storage is gone"));

    const blob = await buildProjectBackupZip({
      leaks: [],
      idbGet: async () => null,
      project,
      vars: null,
    });

    const names = Object.keys((await new JSZip().loadAsync(blob)).files);
    expect(names).toContain("backup.json");
    expect(names).not.toContain("components.json");
  });
});
