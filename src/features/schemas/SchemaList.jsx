import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useSchemas } from "./useSchemas";
import { openSchemaExternally } from "./openSchemaExternally";
import SchemaViewer from "./SchemaViewer";
import {
  formatSchemaSize,
  isImageSchema,
  isLargeSchema,
  isPdfSchema,
} from "@/domain/technologicalSchemas";
import s from "./SchemaList.module.scss";

const ACCEPT = "image/*,application/pdf,.pdf";

/**
 * The drawings attached to a project.
 *
 * Loading them ahead of a walk and adding them part-way through are the same
 * path — nothing here treats an empty list as "not configured yet".
 */
export default function SchemaList({ project }) {
  const { t } = useLanguage();
  const { schemas, loading, error, addSchema, removeSchema, readSchemaFile } =
    useSchemas(project);

  const inputRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  // Object URLs outlive the component unless revoked by hand, and a drawing is
  // the largest thing the app holds — leaking one per open would add up fast.
  useEffect(
    () => () => {
      if (open?.url) URL.revokeObjectURL(open.url);
    },
    [open],
  );

  const handlePick = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setBusy(true);
      setNotice(null);
      try {
        // Warned about, never refused: a drawing somebody needs is worth a slow
        // render, and they should hear about it before the wait, not after.
        if (isLargeSchema({ size: file.size })) {
          setNotice({
            kind: "warning",
            text: t("schemas.largeFile", { size: formatSchemaSize(file.size) }),
          });
        }
        await addSchema(file);
      } catch (addError) {
        setNotice({
          kind: "error",
          text:
            addError?.code === "SCHEMA_UNSUPPORTED"
              ? t("schemas.unsupported")
              : t("schemas.addFailed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [addSchema, t],
  );

  const handleOpen = useCallback(
    async (schema) => {
      setBusy(true);
      setNotice(null);
      try {
        const blob = await readSchemaFile(schema);
        if (!blob) {
          setNotice({ kind: "error", text: t("schemas.missingFile") });
          return;
        }

        if (isImageSchema(schema)) {
          setOpen({ schema, url: URL.createObjectURL(blob) });
          return;
        }
        // PDF goes to whatever the device already reads PDFs with — see
        // openSchemaExternally for why the app does not render it itself.
        await openSchemaExternally(project, schema, blob);
      } catch (openError) {
        setNotice({
          kind: "error",
          text:
            openError?.code === "SCHEMA_OPEN_BLOCKED"
              ? t("schemas.popupBlocked")
              : t("schemas.openFailed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [project, readSchemaFile, t],
  );

  const handleClose = useCallback(() => {
    setOpen((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  if (open) {
    return (
      <SchemaViewer
        src={open.url}
        alt={open.schema.name}
        onClose={handleClose}
        texts={{
          fit: t("schemas.fit"),
          close: t("schemas.close"),
          hint: t("schemas.viewerHint"),
        }}
      />
    );
  }

  return (
    <div className={s.panel}>
      {error && (
        <p className={s.error} role="alert">
          {t("schemas.loadError")}
        </p>
      )}

      {notice && (
        <p
          className={notice.kind === "error" ? s.error : s.warning}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      <button
        type="button"
        className={s.primary}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? t("schemas.working") : t("schemas.add")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handlePick}
        className={s.hiddenInput}
        aria-label={t("schemas.add")}
      />

      {loading ? (
        <p className={s.muted}>{t("schemas.loading")}</p>
      ) : schemas.length === 0 ? (
        <p className={s.muted}>{t("schemas.empty")}</p>
      ) : (
        <ul className={s.list}>
          {schemas.map((schema) => (
            <li key={schema.id} className={s.card}>
              <button
                type="button"
                className={s.cardBody}
                onClick={() => handleOpen(schema)}
                disabled={busy}
              >
                <span className={s.kind}>
                  {isPdfSchema(schema) ? "PDF" : t("schemas.image")}
                </span>
                <span className={s.name}>{schema.name}</span>
                <span className={s.meta}>
                  {[formatSchemaSize(schema.size), schema.location]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
              <button
                type="button"
                className={s.remove}
                onClick={() => removeSchema(schema)}
                aria-label={t("schemas.remove")}
                disabled={busy}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
