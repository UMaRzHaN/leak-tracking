import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ current: null, openExternally: vi.fn() }));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("./useSchemas", () => ({ useSchemas: () => hooks.current }));
vi.mock("./openSchemaExternally", () => ({
  openSchemaExternally: hooks.openExternally,
}));

const SchemaList = (await import("./SchemaList")).default;

const project = { id: "p1", folderName: "buzahur" };
const drawing = {
  id: "s1",
  name: "Схема УППГ.png",
  type: "image/png",
  size: 2 * 1024 * 1024,
};
const pdf = {
  id: "s2",
  name: "Схема обвязки устья.pdf",
  type: "application/pdf",
  size: 1024,
};

function makeHook(overrides = {}) {
  return {
    schemas: [],
    loading: false,
    error: null,
    addSchema: vi.fn().mockResolvedValue(drawing),
    removeSchema: vi.fn().mockResolvedValue(true),
    readSchemaFile: vi.fn().mockResolvedValue(new Blob(["x"])),
    reload: vi.fn(),
    ...overrides,
  };
}

function pickFile(file) {
  const input = screen.getByLabelText("Add schema");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.current = makeHook();
  hooks.openExternally.mockResolvedValue(true);
  globalThis.URL.createObjectURL = vi.fn(() => "blob:schema");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("schema list", () => {
  it("invites drawings without implying setup is incomplete", () => {
    render(<SchemaList project={project} />);
    // Loading ahead of a walk and adding mid-walk are equally normal.
    expect(screen.getByText(/add them as you go/i)).toBeTruthy();
  });

  it("shows size and format for each drawing", () => {
    hooks.current = makeHook({ schemas: [drawing, pdf] });
    render(<SchemaList project={project} />);

    expect(screen.getByText("Схема УППГ.png")).toBeTruthy();
    expect(screen.getByText("2.0 MB")).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
  });

  it("stores a picked file", async () => {
    render(<SchemaList project={project} />);
    pickFile(new File(["x"], "Схема.png", { type: "image/png" }));

    await waitFor(() =>
      expect(hooks.current.addSchema).toHaveBeenCalledTimes(1),
    );
    expect(hooks.current.addSchema.mock.calls[0][0].name).toBe("Схема.png");
  });

  it("warns about a large drawing but still stores it", async () => {
    render(<SchemaList project={project} />);
    const big = new File(["x"], "A1.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 30 * 1024 * 1024 });
    pickFile(big);

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/large file/i);
    // Refusing a drawing somebody needs is worse than a slow render.
    expect(hooks.current.addSchema).toHaveBeenCalledTimes(1);
  });

  it("explains a format it cannot show", async () => {
    hooks.current = makeHook({
      addSchema: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("nope"), { code: "SCHEMA_UNSUPPORTED" }),
        ),
    });
    render(<SchemaList project={project} />);
    pickFile(new File(["x"], "drawing.dwg", { type: "" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/not supported/i),
    );
  });

  it("opens an image in the built-in viewer", async () => {
    hooks.current = makeHook({ schemas: [drawing] });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема УППГ.png"));

    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Схема УППГ.png" }),
      ).toBeTruthy(),
    );
    expect(hooks.openExternally).not.toHaveBeenCalled();
  });

  it("keeps the list reachable behind the open drawing", async () => {
    // The viewer used to replace the screen outright, navigation included.
    hooks.current = makeHook({ schemas: [drawing] });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема УППГ.png"));
    await waitFor(() => screen.getByRole("dialog"));

    expect(screen.getByText("Add schema")).toBeTruthy();
  });

  it("closes the drawing by clicking away from it", async () => {
    hooks.current = makeHook({ schemas: [drawing] });
    const { container } = render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема УППГ.png"));
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(container.querySelector('[class*="backdrop"]'));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes the drawing with Escape", async () => {
    hooks.current = makeHook({ schemas: [drawing] });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема УППГ.png"));
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("hands a PDF to the system viewer instead", async () => {
    hooks.current = makeHook({ schemas: [pdf] });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема обвязки устья.pdf"));

    await waitFor(() => expect(hooks.openExternally).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when the bytes are gone rather than opening a blank viewer", async () => {
    hooks.current = makeHook({
      schemas: [drawing],
      readSchemaFile: vi.fn().mockResolvedValue(null),
    });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема УППГ.png"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/missing/i),
    );
  });

  it("releases the object URL when the viewer closes", async () => {
    hooks.current = makeHook({ schemas: [drawing] });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByText("Схема УППГ.png"));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Close"));

    await waitFor(() =>
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:schema",
      ),
    );
  });

  it("deletes a drawing", () => {
    hooks.current = makeHook({ schemas: [drawing] });
    render(<SchemaList project={project} />);

    fireEvent.click(screen.getByLabelText("Delete schema"));
    expect(hooks.current.removeSchema).toHaveBeenCalledWith(drawing);
  });

  it("reports a list failure instead of looking empty", () => {
    hooks.current = makeHook({ error: new Error("boom") });
    render(<SchemaList project={project} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not read/i);
  });
});
