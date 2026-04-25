import { z } from "zod";

const VALID_STATUSES = ["open", "in_progress", "resolved"];

const PhotoPathSchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => v == null || v.startsWith("idb://") || v.startsWith("data://") ||
            v.startsWith("zip:") || v.startsWith("data:image/") ||
            v.startsWith("Documents/"),
    { message: "Недопустимый формат пути к фото" },
  );

export const LeakRecordSchema = z
  .object({
    id: z.union([z.string().min(1), z.number()]),
    lat: z.number().finite().optional().nullable(),
    lng: z.number().finite().optional().nullable(),
    status: z.enum(VALID_STATUSES).optional().default("open"),
    leak_id: z.string().nullable().optional(),
    component: z.string().nullable().optional(),
    leak_description: z.string().nullable().optional(),
    photo: PhotoPathSchema,
    photo_after: PhotoPathSchema,
  })
  .passthrough(); // preserve extra fields (project-specific columns)

export const BackupSchema = z.array(LeakRecordSchema);

/**
 * Validates a parsed backup JSON value.
 * Returns { ok: true, data } or { ok: false, error: string }.
 */
export function validateBackup(parsed) {
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Ожидается массив JSON" };
  }

  const result = BackupSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => {
        const path = i.path.length ? `[${i.path.join(".")}]` : "корень";
        return `${path}: ${i.message}`;
      })
      .join("; ");
    return { ok: false, error: `Невалидная структура backup: ${issues}` };
  }

  return { ok: true, data: result.data };
}
