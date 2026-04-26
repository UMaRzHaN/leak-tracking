import { vi } from "vitest";
import {
  detectProjectTypeFromLeaks,
  buildProjectBackupZip,
  peekBackupZip,
  importProjectZip,
} from "../../../services/export/backup";
import {
  validateBackup,
  validateProjectBackupMeta,
} from "../../../services/export/backupSchema";

vi.mock("../../../services/photoService", () => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
}));

/* ─────────────────────────────────────────────
   Фикстуры
───────────────────────────────────────────── */
const makeLeak = (overrides = {}) => ({
  id: "leak-1",
  lat: 55.0,
  lng: 73.0,
  status: "open",
  component: "valve",
  ...overrides,
});

const UPSTREAM_PROJECT = {
  id: "proj-u",
  name: "Тенгиз Q1",
  type: "upstream",
  folderName: "tengiz_q1",
};

const MIDSTREAM_PROJECT = {
  id: "proj-m",
  name: "КС Омск",
  type: "midstream",
  folderName: "ks_omsk",
};

const DOWNSTREAM_PROJECT = {
  id: "proj-d",
  name: "Переработка Уфа",
  type: "downstream",
  folderName: "pererabotka_ufa",
};

/* ─────────────────────────────────────────────
   detectProjectTypeFromLeaks
───────────────────────────────────────────── */
describe("detectProjectTypeFromLeaks", () => {
  it("возвращает null для пустого массива", () => {
    expect(detectProjectTypeFromLeaks([])).toBeNull();
  });

  it("возвращает null когда нет совпадающих полей", () => {
    expect(detectProjectTypeFromLeaks([makeLeak()])).toBeNull();
  });

  it("определяет midstream по полю station", () => {
    const leaks = [makeLeak({ station: "КС-1" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("midstream");
  });

  it("определяет midstream по полю field (УМГ)", () => {
    const leaks = [makeLeak({ field: "Западное УМГ" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("midstream");
  });

  it("определяет upstream по полю deposit", () => {
    const leaks = [makeLeak({ deposit: "Тенгиз" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("upstream");
  });

  it("определяет upstream по полю subdivision", () => {
    const leaks = [makeLeak({ subdivision: "НГДУ-1" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("upstream");
  });

  it("определяет downstream по полю district", () => {
    const leaks = [makeLeak({ district: "Ленинский" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("downstream");
  });

  it("определяет downstream по полю locality", () => {
    const leaks = [makeLeak({ locality: "Уфа" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("downstream");
  });

  it("определяет downstream по полю address", () => {
    const leaks = [makeLeak({ address: "ул. Ленина 1" })];
    expect(detectProjectTypeFromLeaks(leaks)).toBe("downstream");
  });

  it("сканирует только первые 20 записей", () => {
    // 25 записей без маркерных полей + 1 с полем на 21-й позиции
    const leaks = Array.from({ length: 25 }, (_, i) =>
      i === 20 ? makeLeak({ id: `l-${i}`, deposit: "x" }) : makeLeak({ id: `l-${i}` }),
    );
    expect(detectProjectTypeFromLeaks(leaks)).toBeNull();
  });
});

/* ─────────────────────────────────────────────
   validateBackup
───────────────────────────────────────────── */
describe("validateBackup", () => {
  it("принимает корректный массив записей", () => {
    const result = validateBackup([makeLeak()]);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it("принимает пустой массив", () => {
    const result = validateBackup([]);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it("отклоняет не-массив", () => {
    const result = validateBackup({ id: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/массив/);
  });

  it("отклоняет запись без id", () => {
    const result = validateBackup([{ lat: 55, lng: 73 }]);
    expect(result.ok).toBe(false);
  });

  it("сохраняет дополнительные поля (passthrough)", () => {
    const result = validateBackup([makeLeak({ deposit: "Тенгиз", custom_field: 42 })]);
    expect(result.ok).toBe(true);
    expect(result.data[0].deposit).toBe("Тенгиз");
    expect(result.data[0].custom_field).toBe(42);
  });

  it("применяет значение по умолчанию status=open если поле отсутствует", () => {
    const leak = { id: "x", lat: 55, lng: 73 };
    const result = validateBackup([leak]);
    expect(result.ok).toBe(true);
    expect(result.data[0].status).toBe("open");
  });
});

/* ─────────────────────────────────────────────
   validateProjectBackupMeta
───────────────────────────────────────────── */
describe("validateProjectBackupMeta", () => {
  const validMeta = {
    schemaVersion: 2,
    exportedAt: "2026-04-26T10:00:00.000Z",
    project: { name: "Тенгиз", type: "upstream", folderName: "tengiz" },
  };

  it("принимает валидные метаданные", () => {
    const result = validateProjectBackupMeta(validMeta);
    expect(result.ok).toBe(true);
  });

  it("отклоняет метаданные без project.name", () => {
    const bad = { ...validMeta, project: { type: "upstream" } };
    expect(validateProjectBackupMeta(bad).ok).toBe(false);
  });

  it("отклоняет неизвестный тип проекта", () => {
    const bad = { ...validMeta, project: { name: "x", type: "unknown" } };
    expect(validateProjectBackupMeta(bad).ok).toBe(false);
  });

  it("принимает метаданные с vars", () => {
    const withVars = { ...validMeta, vars: { density: 0.7, GWP: 28 } };
    const result = validateProjectBackupMeta(withVars);
    expect(result.ok).toBe(true);
    expect(result.data.vars).toEqual({ density: 0.7, GWP: 28 });
  });

  it("принимает все три допустимых типа", () => {
    for (const type of ["upstream", "midstream", "downstream"]) {
      const meta = { ...validMeta, project: { ...validMeta.project, type } };
      expect(validateProjectBackupMeta(meta).ok).toBe(true);
    }
  });
});

/* ─────────────────────────────────────────────
   buildProjectBackupZip + peekBackupZip (round-trip)
───────────────────────────────────────────── */
describe("buildProjectBackupZip + peekBackupZip — round-trip", () => {
  const leaks = [
    makeLeak({ id: "l1", deposit: "Тенгиз", leak_speed: 5 }),
    makeLeak({ id: "l2", deposit: "Кашаган", leak_speed: 3 }),
  ];

  it("peek возвращает те же записи, что были экспортированы", async () => {
    const blob = await buildProjectBackupZip({
      leaks,
      idbGet: null,
      project: UPSTREAM_PROJECT,
      vars: null,
    });
    const peek = await peekBackupZip(blob);
    expect(peek.leaks).toHaveLength(leaks.length);
    expect(peek.leaks[0].id).toBe("l1");
    expect(peek.leaks[1].id).toBe("l2");
  });

  it("peek возвращает корректные метаданные проекта", async () => {
    const blob = await buildProjectBackupZip({
      leaks,
      idbGet: null,
      project: UPSTREAM_PROJECT,
      vars: null,
    });
    const peek = await peekBackupZip(blob);
    expect(peek.meta.project.name).toBe(UPSTREAM_PROJECT.name);
    expect(peek.meta.project.type).toBe(UPSTREAM_PROJECT.type);
  });

  it("detectedType совпадает с типом проекта (определяется по полям записей)", async () => {
    const blob = await buildProjectBackupZip({
      leaks,
      idbGet: null,
      project: UPSTREAM_PROJECT,
      vars: null,
    });
    const peek = await peekBackupZip(blob);
    expect(peek.detectedType).toBe("upstream");
  });

  it("сохраняет и восстанавливает vars", async () => {
    const vars = { density: 0.668, GWP: 28, percentage_gas_to_flare: 50 };
    const blob = await buildProjectBackupZip({
      leaks,
      idbGet: null,
      project: UPSTREAM_PROJECT,
      vars,
    });
    const peek = await peekBackupZip(blob);
    expect(peek.meta.vars).toEqual(vars);
  });

  it("round-trip для midstream определяет тип по station", async () => {
    const midLeaks = [makeLeak({ id: "m1", station: "КС-Омск" })];
    const blob = await buildProjectBackupZip({
      leaks: midLeaks,
      idbGet: null,
      project: MIDSTREAM_PROJECT,
      vars: null,
    });
    const peek = await peekBackupZip(blob);
    expect(peek.detectedType).toBe("midstream");
  });

  it("round-trip для downstream определяет тип по district", async () => {
    const downLeaks = [makeLeak({ id: "d1", district: "Ленинский" })];
    const blob = await buildProjectBackupZip({
      leaks: downLeaks,
      idbGet: null,
      project: DOWNSTREAM_PROJECT,
      vars: null,
    });
    const peek = await peekBackupZip(blob);
    expect(peek.detectedType).toBe("downstream");
  });

  it("выбрасывает ошибку если backup.json отсутствует в архиве", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("project.json", JSON.stringify({ project: { name: "x", type: "upstream" } }));
    const blob = await zip.generateAsync({ type: "blob" });
    await expect(peekBackupZip(blob)).rejects.toThrow("backup.json");
  });
});

/* ─────────────────────────────────────────────
   importProjectZip
───────────────────────────────────────────── */
describe("importProjectZip", () => {
  const leaks = [
    makeLeak({ id: "l1", deposit: "Тенгиз" }),
    makeLeak({ id: "l2", deposit: "Кашаган" }),
  ];

  const makeCtx = (project) => {
    const ctx = {
      addProject: vi.fn(() => {
        ctx.activeProjectIdRef.current = project.id;
        return project;
      }),
      savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: null },
      photoReadyRef: { current: true },
    };
    return ctx;
  };

  it("создаёт проект и сохраняет записи", async () => {
    const blob = await buildProjectBackupZip({
      leaks,
      idbGet: null,
      project: UPSTREAM_PROJECT,
      vars: null,
    });
    const ctx = makeCtx(UPSTREAM_PROJECT);
    const result = await importProjectZip(blob, ctx);

    expect(result.project).toBe(UPSTREAM_PROJECT);
    expect(result.leakCount).toBe(leaks.length);
    expect(ctx.addProject).toHaveBeenCalledWith(UPSTREAM_PROJECT.name, UPSTREAM_PROJECT.type);
    expect(ctx.saveRef.current).toHaveBeenCalledTimes(1);
    const savedLeaks = ctx.saveRef.current.mock.calls[0][0];
    expect(savedLeaks).toHaveLength(leaks.length);
  });

  it("восстанавливает vars в localStorage", async () => {
    const vars = { density: 0.668, GWP: 28 };
    const blob = await buildProjectBackupZip({
      leaks,
      idbGet: null,
      project: UPSTREAM_PROJECT,
      vars,
    });
    const ctx = makeCtx(UPSTREAM_PROJECT);
    await importProjectZip(blob, ctx);

    const stored = localStorage.getItem(`app:${UPSTREAM_PROJECT.id}:vars_v1`);
    expect(JSON.parse(stored)).toEqual(vars);
  });

  it("использует metaFallback когда project.json отсутствует", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify(leaks));
    const blob = await zip.generateAsync({ type: "blob" });

    const fallbackProject = { id: "fb-1", name: "Fallback", type: "upstream", folderName: "fallback" };
    const ctx = makeCtx(fallbackProject);
    const result = await importProjectZip(blob, {
      ...ctx,
      metaFallback: { name: "Fallback", type: "upstream" },
    });

    expect(result.project).toBe(fallbackProject);
    expect(ctx.addProject).toHaveBeenCalledWith("Fallback", "upstream");
  });

  it("выбрасывает ошибку если backup.json отсутствует", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("project.json", JSON.stringify({
      project: { name: "x", type: "upstream" },
    }));
    const blob = await zip.generateAsync({ type: "blob" });
    const ctx = makeCtx(UPSTREAM_PROJECT);
    await expect(importProjectZip(blob, ctx)).rejects.toThrow("backup.json");
  });

  it("выбрасывает ошибку если метаданные и metaFallback отсутствуют", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify(leaks));
    const blob = await zip.generateAsync({ type: "blob" });
    const ctx = makeCtx(UPSTREAM_PROJECT);
    await expect(importProjectZip(blob, ctx)).rejects.toThrow();
  });

  afterEach(() => {
    localStorage.clear();
  });
});
