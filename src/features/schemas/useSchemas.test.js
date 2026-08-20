import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listSchemas: vi.fn(),
  addSchema: vi.fn(),
  removeSchema: vi.fn(),
  readSchemaFile: vi.fn(),
}));
vi.mock("@/repositories/SchemaRepository", () => ({ SchemaRepository: repo }));

const { useSchemas } = await import("./useSchemas");

const project = { id: "p1", folderName: "tengiz" };
const drawing = (name = "obvyazka.pdf") =>
  new File(["%PDF-1.4"], name, { type: "application/pdf" });

async function mounted(target = project) {
  const hook = renderHook(({ p }) => useSchemas(p), {
    initialProps: { p: target },
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useSchemas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repo.listSchemas.mockResolvedValue([]);
    repo.addSchema.mockResolvedValue(undefined);
    repo.removeSchema.mockResolvedValue(true);
  });

  it("holds nothing and stops loading when there is no project", async () => {
    const { result } = await mounted(null);

    expect(result.current.schemas).toEqual([]);
    expect(repo.listSchemas).not.toHaveBeenCalled();
    await expect(result.current.addSchema(drawing())).resolves.toBeNull();
    expect(repo.addSchema).not.toHaveBeenCalled();
  });

  it("surfaces a failed read instead of showing an empty list", async () => {
    // Пустой список и нечитаемое хранилище — разные вещи: на первом человек
    // прикрепит чертёж, на втором должен увидеть ошибку.
    const failure = new Error("storage unavailable");
    repo.listSchemas.mockRejectedValue(failure);

    const { result } = await mounted();

    expect(result.current.error).toBe(failure);
    expect(result.current.schemas).toEqual([]);
  });

  it("refuses a file that is neither drawing nor PDF, and writes nothing", async () => {
    const { result } = await mounted();

    await expect(
      result.current.addSchema(new File(["x"], "smeta.xlsx")),
    ).rejects.toMatchObject({ code: "SCHEMA_UNSUPPORTED" });
    expect(repo.addSchema).not.toHaveBeenCalled();
    expect(result.current.schemas).toEqual([]);
  });

  it("keeps both drawings added one after another without waiting", async () => {
    // Ради этого очередь и заведена: обе записи переписывают указатель
    // целиком, и без неё вторая затёрла бы первую.
    const order = [];
    let releaseFirst;
    repo.addSchema.mockImplementation(async (_project, entry) => {
      order.push(`start:${entry.name}`);
      if (entry.name === "first.pdf") {
        await new Promise((resolve) => (releaseFirst = resolve));
      }
      order.push(`done:${entry.name}`);
    });

    const { result } = await mounted();

    let both;
    act(() => {
      both = Promise.all([
        result.current.addSchema(drawing("first.pdf")),
        result.current.addSchema(drawing("second.pdf")),
      ]);
    });

    // Вторая не начата, пока первая держит очередь.
    await act(async () => {});
    expect(order).toEqual(["start:first.pdf"]);

    await act(async () => {
      releaseFirst();
      await both;
    });

    expect(order).toEqual([
      "start:first.pdf",
      "done:first.pdf",
      "start:second.pdf",
      "done:second.pdf",
    ]);
    expect(result.current.schemas.map((s) => s.name)).toEqual([
      "first.pdf",
      "second.pdf",
    ]);
  });

  it("lets the next write through after one of them fails", async () => {
    repo.addSchema
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);

    const { result } = await mounted();

    await act(async () => {
      await expect(
        result.current.addSchema(drawing("lost.pdf")),
      ).rejects.toThrow("disk full");
    });
    await act(async () => {
      await result.current.addSchema(drawing("kept.pdf"));
    });

    expect(result.current.schemas.map((s) => s.name)).toEqual(["kept.pdf"]);
  });

  it("drops a drawing from the list only when the repository confirms", async () => {
    const stored = { id: "s1", name: "obvyazka.pdf", type: "pdf" };
    repo.listSchemas.mockResolvedValue([stored]);
    repo.removeSchema.mockResolvedValueOnce(false);

    const { result } = await mounted();
    expect(result.current.schemas).toEqual([stored]);

    await act(async () => {
      await expect(result.current.removeSchema(stored)).resolves.toBe(false);
    });
    expect(result.current.schemas).toEqual([stored]);

    repo.removeSchema.mockResolvedValueOnce(true);
    await act(async () => {
      await expect(result.current.removeSchema(stored)).resolves.toBe(true);
    });
    expect(result.current.schemas).toEqual([]);
  });
});
