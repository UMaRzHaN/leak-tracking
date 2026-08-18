import { describe, expect, it } from "vitest";
import {
  allocateSchemaFileName,
  createSchemaEntry,
  formatSchemaSize,
  isImageSchema,
  isLargeSchema,
  isPdfSchema,
  isSupportedSchema,
  LARGE_SCHEMA_BYTES,
  resolveSchemaType,
} from "@/domain/technologicalSchemas";

describe("schema type resolution", () => {
  it("trusts what the file reports", () => {
    expect(resolveSchemaType({ name: "a.png", type: "image/png" })).toBe(
      "image/png",
    );
    expect(resolveSchemaType({ name: "a.pdf", type: "application/pdf" })).toBe(
      "application/pdf",
    );
  });

  it("falls back to the extension when the picker reports nothing", () => {
    // Android's picker hands back an empty type for anything it does not
    // recognise, PDFs included on some devices.
    expect(resolveSchemaType({ name: "Схема УППГ.pdf", type: "" })).toBe(
      "application/pdf",
    );
    expect(resolveSchemaType({ name: "scan.JPEG", type: "" })).toBe(
      "image/jpeg",
    );
  });

  it("ignores a type the app cannot show", () => {
    expect(
      resolveSchemaType({ name: "drawing.dwg", type: "image/vnd.dwg" }),
    ).toBe("");
    expect(isSupportedSchema({ type: "" })).toBe(false);
  });

  it("separates what renders in-app from what goes to the system viewer", () => {
    expect(isImageSchema({ type: "image/png" })).toBe(true);
    expect(isPdfSchema({ type: "image/png" })).toBe(false);
    expect(isPdfSchema({ type: "application/pdf" })).toBe(true);
    expect(isImageSchema({ type: "application/pdf" })).toBe(false);
  });
});

describe("schema entries", () => {
  it("keeps the original name as the title", () => {
    const entry = createSchemaEntry(
      { name: "Схема обвязки устья.pdf", type: "application/pdf", size: 120 },
      { now: 1_700_000_000_000 },
    );

    expect(entry.name).toBe("Схема обвязки устья.pdf");
    expect(entry.type).toBe("application/pdf");
    expect(entry.size).toBe(120);
    expect(entry.addedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("carries an optional location label and nothing more", () => {
    const entry = createSchemaEntry(
      { name: "a.png", type: "image/png", size: 1 },
      { location: " Скважина 22 " },
    );
    expect(entry.location).toBe("Скважина 22");
    expect(createSchemaEntry({ name: "a.png" }).location).toBe("");
  });

  it("names an unnamed file rather than storing a blank", () => {
    expect(createSchemaEntry({ name: "  " }).name).toBe("schema");
  });
});

describe("large schemas", () => {
  it("flags a drawing past the warning threshold but never refuses it", () => {
    expect(isLargeSchema({ size: LARGE_SCHEMA_BYTES + 1 })).toBe(true);
    expect(isLargeSchema({ size: LARGE_SCHEMA_BYTES })).toBe(false);
    // Support is about the format, not the size — a huge drawing is still one
    // the app will load.
    expect(isSupportedSchema({ type: "image/png", size: 1e9 })).toBe(true);
  });
});

describe("archive file names", () => {
  it("keeps spaces and Cyrillic so the folder reads like the documentation", () => {
    expect(allocateSchemaFileName("Схема обвязки устья.pdf")).toBe(
      "Схема обвязки устья.pdf",
    );
  });

  it("replaces the characters a filesystem refuses", () => {
    expect(allocateSchemaFileName("УППГ:/схема?.png")).toBe("УППГ--схема-.png");
  });

  it("keeps two identically named drawings apart", () => {
    const used = new Set(["Схема.pdf"]);
    const next = allocateSchemaFileName("Схема.pdf", used);
    expect(next).toBe("Схема (2).pdf");

    used.add(next);
    expect(allocateSchemaFileName("Схема.pdf", used)).toBe("Схема (3).pdf");
  });

  it("falls back to a usable name for junk input", () => {
    expect(allocateSchemaFileName("")).toBe("schema");
    expect(allocateSchemaFileName("...")).toBe("schema");
  });
});

describe("size formatting", () => {
  it("switches to megabytes past a megabyte", () => {
    expect(formatSchemaSize(512 * 1024)).toBe("512 KB");
    expect(formatSchemaSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });

  it("does not print an empty size for a missing one", () => {
    expect(formatSchemaSize(0)).toBe("0 MB");
    expect(formatSchemaSize(undefined)).toBe("0 MB");
  });
});
